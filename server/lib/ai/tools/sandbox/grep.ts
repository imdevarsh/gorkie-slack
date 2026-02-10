import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './bash/sandbox';
import { toBase64Json } from './utils';

const DEFAULT_LIMIT = 100;

export const grep = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Search file contents in the sandbox using a regex pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z
        .string()
        .optional()
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
        .optional()
        .describe('Max matches to return (default: 100, max: 500)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({
      pattern,
      path = '.',
      include,
      limit = DEFAULT_LIMIT,
      status,
    }) => {
      await setStatus(context, {
        status: status ?? 'is searching files',
        loading: true,
      });

      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);
        const params = { pattern, path, include, limit };
        const payload = toBase64Json(params);
        const command = `PARAMS_B64='${payload}' python3 agent/bin/grep.py`;

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: stderr || `Failed to search: ${pattern}`,
          };
        }

        const data = JSON.parse(stdout || '{}') as {
          path?: string;
          count?: number;
          truncated?: boolean;
          output?: string;
        };

        const response = {
          success: true,
          path: data.path ?? path,
          count: data.count ?? 0,
          truncated: data.truncated ?? false,
          output: data.output ?? '',
        };

        logger.debug(
          {
            ctxId,
            pattern,
            path,
            include,
            count: response.count,
            truncated: response.truncated,
          },
          'Grep complete'
        );

        return response;
      } catch (error) {
        logger.error({ error, pattern, path }, 'Failed to grep in sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
