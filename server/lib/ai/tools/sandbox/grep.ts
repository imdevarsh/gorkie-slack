import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

const outputSchema = z.object({
  path: z.string(),
  count: z.number(),
  truncated: z.boolean(),
  output: z.string(),
});

export const grep = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Search file contents in the sandbox using a regex pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z
        .string()
        .default('.')
        .describe('Directory path in sandbox (relative, default: .)'),
      include: z
        .string()
        .optional()
        .describe('Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Max matches to return (default: 100, max: 500)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ pattern, path, include, limit, status }) => {
      await setStatus(context, {
        status: status ?? 'is searching files',
        loading: true,
      });

      const ctxId = getContextId(context);

      try {
        const sandbox = await getSandbox(context);
        const payload = Buffer.from(
          JSON.stringify({ pattern, path, include, limit })
        ).toString('base64');

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', 'PARAMS="$1" python3 agent/bin/grep.py', '--', payload],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: stderr || `Failed to search: ${pattern}`,
          };
        }

        const data = outputSchema.parse(JSON.parse(stdout || '{}'));

        logger.debug(
          { ctxId, pattern, path, include, count: data.count },
          `Found ${data.count} matches for ${pattern}`
        );

        return {
          success: true,
          path: data.path,
          count: data.count,
          truncated: data.truncated,
          output: data.output,
        };
      } catch (error) {
        logger.error(
          { ctxId, error, pattern, path },
          `Grep failed for pattern ${pattern}`
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
