import { tool } from 'ai';
import { z } from 'zod';
import { tools } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { addHistory } from '~/lib/sandbox/history';
import { outputDir, sandboxPath, turnsPath } from '~/lib/sandbox/paths';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const bash = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Run a shell command.',
    inputSchema: z.object({
      command: z.string().describe('Shell command (runs via sh -c)'),
      workdir: z.string().optional().describe('Working directory (relative)'),
      status: z
        .string()
        .describe('Status text formatted like "is xyz"')
        .optional(),
    }),
    execute: async ({ command, workdir, status }) => {
      const ctxId = getContextId(context);
      const ts = (context.event as { ts?: string }).ts ?? 'unknown';
      const logPath = turnsPath(ts);

      try {
        const cwd = sandboxPath(workdir ?? '.');
        const sandbox = await getSandbox(context);

        await sandbox.runCommand({
          cmd: 'mkdir',
          args: ['-p', outputDir(ts), sandboxPath('agent/turns')],
        });

        await setStatus(context, {
          status: status ?? 'is running commands in the sandbox',
          loading: true,
        });

        logger.debug(
          { ctxId, command, cwd },
          '[sandbox] Command execution started'
        );

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
          cwd,
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const exitCode = result.exitCode;

        if (exitCode !== 0) {
          logger.warn(
            {
              ctxId,
              command,
              cwd,
              exitCode,
              stderr: stderr.slice(0, 1000),
              stdout: stdout.slice(0, 1000),
            },
            '[sandbox] Command exited with non-zero status'
          );
        }

        await addHistory(sandbox, logPath, {
          command,
          workdir: cwd,
          status,
          stdout,
          stderr,
          exitCode,
        });

        const out = truncate(stdout || '(no output)', logPath);
        const err = truncate(stderr, logPath);

        logger.debug(
          {
            ctxId,
            exitCode,
            out,
            err,
          },
          '[sandbox] Command execution completed'
        );

        return {
          output: out.text,
          error: err.text,
          exitCode,
          ...(out.truncated || err.truncated ? { fullOutput: logPath } : {}),
        };
      } catch (error) {
        logger.error({ error, command, ctxId }, '[sandbox] Command crashed');
        await redis.del(redisKeys.sandbox(ctxId));

        return {
          output: '',
          error: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
  });

function truncate(
  raw: string,
  logPath: string
): { text: string; truncated: boolean } {
  const lines = raw.split('\n');
  const totalBytes = Buffer.byteLength(raw, 'utf-8');

  if (
    lines.length <= tools.bash.maxOutputLines &&
    totalBytes <= tools.bash.maxOutputBytes
  ) {
    return { text: raw, truncated: false };
  }

  const kept: string[] = [];
  let bytes = 0;
  let hitBytes = false;

  for (let i = 0; i < lines.length && i < tools.bash.maxOutputLines; i++) {
    const line = lines[i] ?? '';
    const size = Buffer.byteLength(line, 'utf-8') + (i > 0 ? 1 : 0);
    if (bytes + size > tools.bash.maxOutputBytes) {
      hitBytes = true;
      break;
    }
    kept.push(line);
    bytes += size;
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - kept.length;
  const unit = hitBytes ? 'bytes' : 'lines';
  const hint =
    `Output truncated. Full content saved to: ${logPath}\n` +
    'Use Read on that file with offset/limit, or Grep to search it.';

  return {
    text: `${kept.join('\n')}\n\n...${removed} ${unit} truncated...\n\n${hint}`,
    truncated: true,
  };
}
