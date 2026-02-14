import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { sandboxPath } from '~/lib/sandbox/utils';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const glob = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Find files by glob pattern in the sandbox.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern to match (e.g. "**/*.ts")'),
      path: z.string().default('.').describe('Directory path in sandbox'),
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
      const resolvedPath = sandboxPath(path);

      try {
        const sandbox = await getSandbox(context);
        const result = await sandbox.runCommand({
          cmd: 'fd',
          args: [
            '--glob',
            '--color',
            'never',
            '--max-results',
            String(limit + 1),
            pattern,
            resolvedPath,
          ],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0 && result.exitCode !== 1) {
          logger.warn(
            {
              ctxId,
              pattern,
              path: resolvedPath,
              limit,
              exitCode: result.exitCode,
              stderr: stderr.slice(0, 1000),
              stdout: stdout.slice(0, 1000),
            },
            '[sandbox] fd command failed'
          );
          return {
            success: false,
            error: stderr || `Failed to match pattern: ${pattern}`,
          };
        }

        const matches = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        const truncated = matches.length > limit;
        const limited = truncated ? matches.slice(0, limit) : matches;

        logger.debug(
          { ctxId, pattern, path: resolvedPath, count: limited.length },
          '[sandbox] Glob completed'
        );

        return {
          success: true,
          path: resolvedPath,
          count: limited.length,
          truncated,
          output: limited.join('\n'),
          matches: limited,
        };
      } catch (error) {
        logger.error(
          { ctxId, error, pattern, path: resolvedPath, limit },
          '[sandbox] Glob failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
