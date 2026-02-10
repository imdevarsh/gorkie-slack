import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { getOrCreate } from './sandbox';

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;

function truncateOutput(
  output: string,
  turnPath: string
): { content: string; truncated: boolean } {
  const lines = output.split('\n');
  const totalBytes = Buffer.byteLength(output, 'utf-8');

  if (lines.length <= MAX_LINES && totalBytes <= MAX_BYTES) {
    return { content: output, truncated: false };
  }

  const preview: string[] = [];
  let bytes = 0;
  let hitBytes = false;

  for (let i = 0; i < lines.length && i < MAX_LINES; i++) {
    const line = lines[i] ?? '';
    const size = Buffer.byteLength(line, 'utf-8') + (i > 0 ? 1 : 0);
    if (bytes + size > MAX_BYTES) {
      hitBytes = true;
      break;
    }
    preview.push(line);
    bytes += size;
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - preview.length;
  const unit = hitBytes ? 'bytes' : 'lines';
  const hint =
    `The tool call succeeded but the output was truncated. Full output saved to: ${turnPath}\n` +
    'Use Grep to search the full content or Read with offset/limit to view specific sections.';

  const message = `${preview.join('\n')}\n\n...${removed} ${unit} truncated...\n\n${hint}`;

  return { content: message, truncated: true };
}

export const bash = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) => {
  let turn = 0;

  return tool({
    description:
      'Run a shell command in a sandboxed Linux VM. Persists per thread, installed tools and files carry over between calls. Supports bash, node, python, curl, npm, dnf.',
    inputSchema: z.object({
      command: z.string().describe('Shell command (runs via sh -c)'),
      workdir: z
        .string()
        .optional()
        .describe('Working directory (relative). Prefer this over "cd &&"'),
      status: z
        .string()
        .describe('Status text formatted like "is xyz"')
        .optional(),
    }),
    execute: async ({ command, workdir, status }) => {
      const ctxId = getContextId(context);
      turn++;
      const messageTs = (context.event as { ts?: string }).ts ?? 'unknown';
      const outputDir = `output/${messageTs}`;
      const turnDir = `agent/turns/${messageTs}`;

      try {
        const sandbox = await getOrCreate(
          ctxId,
          context,
          files?.length ? { files, messageTs: context.event.ts } : undefined
        );
        await sandbox.runCommand({
          cmd: 'mkdir',
          args: ['-p', outputDir, turnDir],
        });
        if (status) {
          await setStatus(context, { status, loading: true });
        } else {
          await setStatus(context, {
            status: 'is running commands in sandbox',
            loading: true,
          });
        }

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
          cwd: workdir ?? outputDir,
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const exitCode = result.exitCode;

        logger.debug(
          {
            ctxId,
            exitCode,
            command,
            workdir,
            status,
          },
          'Sandbox command complete'
        );

        const turnPath = `${turnDir}/${turn}.json`;
        await sandbox
          .writeFiles([
            {
              path: turnPath,
              content: Buffer.from(
                JSON.stringify(
                  { command, workdir, status, stdout, stderr, exitCode },
                  null,
                  2
                )
              ),
            },
          ])
          .catch((error: unknown) => {
            logger.warn({ error, turnPath }, 'Failed to write turn log');
          });

        const stdoutResult = truncateOutput(stdout || '(no output)', turnPath);
        const stderrResult = truncateOutput(stderr, turnPath);

        return {
          stdout: stdoutResult.content,
          stderr: stderrResult.content,
          exitCode,
          ...(stdoutResult.truncated || stderrResult.truncated
            ? { fullOutput: turnPath }
            : {}),
        };
      } catch (error) {
        logger.error({ error, ctxId, command }, 'Sandbox operation failed');
        await redis.del(redisKeys.sandbox(ctxId));

        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
  });
};
