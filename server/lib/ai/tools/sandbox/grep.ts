import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { runSandboxCommand } from '~/lib/sandbox/modal';
import { sandboxPath } from '~/lib/sandbox/paths';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const grep = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Search file contents in the sandbox using a regex pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().default('.').describe('Directory path in sandbox'),
      include: z
        .string()
        .optional()
        .describe('Glob pattern to filter files (e.g. "*.ts", "*.tsx")'),
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
      const resolvedPath = sandboxPath(path);

      try {
        const sandbox = await getSandbox(context);
        const effectiveLimit = limit + 1;
        const result = await runSandboxCommand(sandbox, {
          cmd: 'bash',
          args: [
            '-lc',
            [
              'set -o pipefail',
              'cd "$1" || exit 2',
              'PATTERN="$2"',
              'INCLUDE="$3"',
              'LIMIT="$4"',
              'if [ -n "$INCLUDE" ]; then',
              '  rg --line-number --no-heading --color never --hidden --follow --glob "$INCLUDE" --glob "!node_modules/**" --glob "!.git/**" -e "$PATTERN" . | head -n "$LIMIT"',
              'fi',
              'rg --line-number --no-heading --color never --hidden --follow --glob "!node_modules/**" --glob "!.git/**" -e "$PATTERN" . | head -n "$LIMIT"',
            ].join('\n'),
            '--',
            resolvedPath,
            pattern,
            include ?? '',
            String(effectiveLimit),
          ],
        });

        if (!(result.exitCode === 0 || result.exitCode === 1)) {
          logger.warn(
            {
              ctxId,
              pattern,
              include,
              path: resolvedPath,
              limit,
              exitCode: result.exitCode,
              stderr: result.stderr.slice(0, 1000),
              stdout: result.stdout.slice(0, 1000),
            },
            '[sandbox] Grep command failed'
          );
          return {
            success: false,
            error: result.stderr || `Failed to search: ${pattern}`,
          };
        }

        const lines = result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const truncated = lines.length > limit;
        const matches = truncated ? lines.slice(0, limit) : lines;

        const output = matches
          .map((line) => {
            const idx = line.indexOf(':');
            if (idx === -1) {
              return line;
            }
            const file = line.slice(0, idx);
            const rest = line.slice(idx + 1);
            return `${file}\n  ${rest}`;
          })
          .join('\n');

        logger.debug(
          {
            ctxId,
            pattern,
            path: resolvedPath,
            include,
            count: matches.length,
          },
          '[sandbox] Grep completed'
        );

        return {
          success: true,
          path: resolvedPath,
          count: matches.length,
          truncated,
          output,
        };
      } catch (error) {
        logger.error(
          { ctxId, error, pattern, include, path, limit },
          '[sandbox] Grep failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
