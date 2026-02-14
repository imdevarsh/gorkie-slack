import nodePath from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { sandboxPath } from '~/lib/sandbox/utils';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

function toGlobRegex(globPattern: string): RegExp {
  const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const wildcard = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${wildcard}$`);
}

export const grep = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Search file contents in the sandbox using a regex pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().default('.').describe('Directory path in sandbox'),
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
        const resolvedPath = sandboxPath(path);
        const sandbox = await getSandbox(context);
        const matches = await sandbox.fs.findFiles(resolvedPath, pattern);
        const includeRegex = include ? toGlobRegex(include) : null;

        const lines = matches
          .filter((match) => {
            if (!includeRegex) {
              return true;
            }
            return includeRegex.test(nodePath.basename(match.file));
          })
          .map((match) => `${match.file}:${match.line}:${match.content}`)
          .filter(Boolean);

        const truncated = lines.length > limit;
        const limited = truncated ? lines.slice(0, limit) : lines;

        logger.debug(
          {
            ctxId,
            pattern,
            path: resolvedPath,
            include,
            count: limited.length,
          },
          '[sandbox] Grep completed'
        );

        return {
          success: true,
          path: resolvedPath,
          count: limited.length,
          truncated,
          output: limited.join('\n'),
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
