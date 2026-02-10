import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './execute-code/sandbox';

export const readFile = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Read file contents from the sandbox filesystem with optional pagination.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Line number to start reading from (0-based, default: 0)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum lines to return (default: 200, max: 500)'),
    }),
    execute: async ({ path, offset = 0, limit = 200 }) => {
      await setStatus(context, { status: 'is reading file', loading: true });
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: [
            '-c',
            `wc -l < "${path}" 2>/dev/null && sed -n '${offset + 1},${offset + limit}p' "${path}"`,
          ],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: stderr || `File not found: ${path}`,
          };
        }

        const lines = stdout.split('\n');
        const totalLines = Number.parseInt(lines[0] ?? '0', 10);
        const content = lines.slice(1).join('\n');

        return {
          success: true,
          content,
          totalLines,
          offset,
          linesReturned: Math.min(limit, Math.max(0, totalLines - offset)),
        };
      } catch (error) {
        logger.error({ error, path }, 'Failed to read file from sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
