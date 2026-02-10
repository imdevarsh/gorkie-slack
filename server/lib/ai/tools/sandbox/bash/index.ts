import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { getOrCreate } from './sandbox';

const MAX_OUTPUT_LENGTH = 16_000;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }
  const half = Math.floor(MAX_OUTPUT_LENGTH / 2);
  const omitted = output.length - MAX_OUTPUT_LENGTH;
  return `${output.slice(0, half)}\n\n... (${omitted} characters omitted, full output in agent/turns/) ...\n\n${output.slice(-half)}`;
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
      status: z
        .string()
        .describe('Status text formatted like "is xyz"')
        .optional(),
    }),
    execute: async ({ command, status }) => {
      const ctxId = getContextId(context);
      turn++;

      try {
        const sandbox = await getOrCreate(
          ctxId,
          context,
          files?.length ? { files, messageTs: context.event.ts } : undefined
        );
        if (status) {
          await setStatus(context, { status, loading: true });
        } else {
          await setStatus(context, {
            status: 'is running commands in sandbox',
            loading: true,
          });
        }

        logger.debug({ ctxId, command, status }, 'Sandbox command starting');

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const exitCode = result.exitCode;

        if (exitCode !== 0) {
          logger.debug(
            { ctxId, exitCode, command, status },
            'Sandbox command failed'
          );
        }

        const turnPath = `agent/turns/${turn}.json`;
        await sandbox
          .writeFiles([
            {
              path: turnPath,
              content: Buffer.from(
                JSON.stringify(
                  { command, status, stdout, stderr, exitCode },
                  null,
                  2
                )
              ),
            },
          ])
          .catch((error: unknown) => {
            logger.warn({ error, turnPath }, 'Failed to write turn log');
          });

        const isTruncated =
          stdout.length > MAX_OUTPUT_LENGTH ||
          stderr.length > MAX_OUTPUT_LENGTH;

        return {
          stdout: truncateOutput(stdout || '(no output)'),
          stderr: truncateOutput(stderr),
          exitCode,
          ...(isTruncated ? { fullOutput: turnPath } : {}),
        };
      } catch (error) {
        logger.error({ error, ctxId }, 'Sandbox command failed');
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
