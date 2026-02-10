import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const write = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Write a file to the sandbox filesystem.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
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
        const sandbox = await getSandbox(ctxId);
        await sandbox.writeFiles([
          { path, content: Buffer.from(content, 'utf-8') },
        ]);

        const response = {
          success: true,
          path,
          output: 'ok',
        };

        logger.debug(
          { ctxId, path, output: response.output },
          'Write complete'
        );

        return response;
      } catch (error) {
        logger.error({ error, path, ctxId }, 'Failed to write file in sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
