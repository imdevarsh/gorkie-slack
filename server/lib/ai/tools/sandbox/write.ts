import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { sandboxPath } from '~/lib/sandbox/paths';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const write = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Write a file to the sandbox filesystem.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox'),
      content: z.string().describe('File contents'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ path, content, status }) => {
      await setStatus(context, {
        status: status ?? 'is writing file',
        loading: true,
      });
      const ctxId = getContextId(context);

      try {
        const resolvedPath = sandboxPath(path);
        const sandbox = await getSandbox(context);
        await sandbox.writeFiles([
          { path: resolvedPath, content: Buffer.from(content, 'utf-8') },
        ]);

        logger.debug(
          { path: resolvedPath, ctxId },
          '[sandbox] Write completed'
        );

        return { success: true, path: resolvedPath };
      } catch (error) {
        logger.error({ error, path, ctxId }, '[sandbox] Write failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
