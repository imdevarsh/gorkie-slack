import { tool } from 'ai';
import { z } from 'zod';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { transportAttachments } from './attachments';
import { getOrCreate } from './sandbox';

export type { SandboxFile } from './attachments';
export { buildAttachmentHints } from './attachments';

export const executeCode = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) => {
  let filesTransported = false;

  return tool({
    description:
      'Run a shell command in a sandboxed Linux VM. Persists per thread, installed tools and files carry over between calls. Supports bash, node, python, curl, npm, dnf.',
    inputSchema: z.object({
      command: z.string().describe('Shell command (runs via sh -c)'),
    }),
    execute: async ({ command }) => {
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);

        if (!filesTransported && files?.length) {
          await transportAttachments(sandbox, context.event.ts, files);
          filesTransported = true;
        }

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        return {
          stdout: stdout || '(no output)',
          stderr,
          exitCode: result.exitCode,
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
