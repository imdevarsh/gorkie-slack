import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './bash/sandbox';
export const read = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Read file contents from the sandbox filesystem with optional pagination.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Line number to start reading from (0-based, default: 0)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(200)
        .describe('Maximum lines to return (default: 200, max: 500)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ path, offset, limit, status }) => {
      await setStatus(context, {
        status: status ?? 'is reading file',
        loading: true,
      });
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);
        const fileBuffer = await sandbox.readFileToBuffer({ path });

        if (!fileBuffer) {
          return { success: false, error: `File not found: ${path}` };
        }

        const lines = fileBuffer.toString('utf-8').split('\n');
        const totalLines = lines.length;
        const start = Math.max(0, offset);
        const end = Math.min(totalLines, start + limit);
        const content = lines.slice(start, end).join('\n');

        const response = {
          success: true,
          content,
          totalLines,
          offset: start,
          linesReturned: Math.max(0, end - start),
        };

        logger.debug(
          {
            ctxId,
            path,
            totalLines: response.totalLines,
            linesReturned: response.linesReturned,
          },
          'Read complete'
        );

        return response;
      } catch (error) {
        logger.error({ error, path }, 'Failed to read file from sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
