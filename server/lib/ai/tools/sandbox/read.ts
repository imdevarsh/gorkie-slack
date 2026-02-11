import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
export const read = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Reads a file from the sandbox filesystem. You can access any file directly by using this tool.',
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
        .max(2000)
        .default(2000)
        .describe('Maximum lines to return (default: 2000, max: 2000)'),
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
        const sandbox = await getSandbox(ctxId, context);
        const fileBuffer = await sandbox.readFileToBuffer({ path });

        if (!fileBuffer) {
          return { success: false, error: `File not found: ${path}` };
        }

        const lines = fileBuffer.toString('utf-8').split('\n');
        const totalLines = lines.length;
        const start = Math.max(0, offset);
        const end = Math.min(totalLines, start + limit);
        const numbered: string[] = [];

        for (let i = start; i < end; i++) {
          const line = lines[i] ?? '';
          const truncated =
            line.length > 2000 ? `${line.slice(0, 2000)}...` : line;
          const lineNo = String(i + 1).padStart(6, ' ');
          numbered.push(`${lineNo}\t${truncated}`);
        }

        const content = numbered.join('\n');

        const linesReturned = Math.max(0, end - start);
        logger.debug(
          { path, totalLines, linesReturned },
          `[${ctxId}] Read ${linesReturned} lines from ${path}`
        );

        return {
          success: true,
          content,
          totalLines,
          offset: start,
          linesReturned,
        };
      } catch (error) {
        logger.error({ error, path }, `[${ctxId}] Failed to read ${path}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
