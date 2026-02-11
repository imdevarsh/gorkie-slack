import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const glob = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Find files by glob pattern in the sandbox.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern to match (e.g. "**/*.ts")'),
      path: z
        .string()
        .default('.')
        .describe('Directory path in sandbox (relative, default: .)'),
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
    execute: async ({ pattern, path, limit, status }) => {
      await setStatus(context, {
        status: status ?? 'is finding files',
        loading: true,
      });

      const ctxId = getContextId(context);

      try {
        const sandbox = await getSandbox(ctxId, context);

        const command = [
          `fd --type f --glob '${escapeShell(pattern)}' '${escapeShell(path)}'`,
          `-X stat -c '%Y\\t%n' 2>/dev/null`,
          `| sort -t$'\\t' -k1 -rn`,
          `| head -n ${limit}`,
        ].join(' ');

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0 && !stdout.trim()) {
          return {
            success: false,
            error: stderr || `Failed to match pattern: ${pattern}`,
          };
        }

        const paths = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const tab = line.indexOf('\t');
            return tab >= 0 ? line.slice(tab + 1) : line;
          });

        const truncated = paths.length >= limit;
        const output = paths.length > 0 ? paths.join('\n') : 'No files found';

        logger.debug(
          { pattern, path, count: paths.length },
          `[${ctxId}] Found ${paths.length} files matching ${pattern}`
        );

        return {
          success: true,
          path,
          count: paths.length,
          truncated,
          output,
        };
      } catch (error) {
        logger.error(
          { error, pattern, path },
          `[${ctxId}] Glob failed for pattern ${pattern}`
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

function escapeShell(value: string): string {
  return value.replace(/'/g, "'\\''");
}
