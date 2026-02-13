import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { runSandboxCommand } from '~/lib/sandbox/modal';
import { sandboxPath } from '~/lib/sandbox/paths';
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
        const effectiveLimit = limit + 1;
        const result = await runSandboxCommand(sandbox, {
          cmd: 'sh',
          args: [
            '-lc',
            [
              'cd "$1" || exit 2',
              'PATTERN="$2"',
              'LIMIT="$3"',
              'fd --type f --hidden --follow --exclude .git --exclude node_modules --glob "$PATTERN" . | sort | head -n "$LIMIT"',
            ].join('\n'),
            '--',
            resolvedPath,
            pattern,
            String(effectiveLimit),
          ],
        });

        if (result.exitCode !== 0) {
          logger.warn(
            {
              ctxId,
              pattern,
              path: resolvedPath,
              limit,
              exitCode: result.exitCode,
              stderr: result.stderr.slice(0, 1000),
              stdout: result.stdout.slice(0, 1000),
            },
            '[sandbox] Glob command failed'
          );
          return {
            success: false,
            error: result.stderr || `Failed to match pattern: ${pattern}`,
          };
        }

        const lines = result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const truncated = lines.length > limit;
        const matches = truncated ? lines.slice(0, limit) : lines;

        logger.debug(
          { ctxId, pattern, path: resolvedPath, count: matches.length },
          '[sandbox] Glob completed'
        );

        return {
          success: true,
          path: resolvedPath,
          count: matches.length,
          truncated,
          output: matches.join('\n'),
          matches,
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
