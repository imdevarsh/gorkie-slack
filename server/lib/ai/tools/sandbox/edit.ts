import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './bash/sandbox';
import { toBase64Json } from './utils';

function toBase64(value: string): string {
  return Buffer.from(value).toString('base64');
}

export const edit = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Edit a file by exact string replacement.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
      oldString: z.string().describe('Exact string to replace'),
      newString: z.string().describe('Replacement string'),
      replaceAll: z
        .boolean()
        .optional()
        .describe('Replace all occurrences (default: false)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({
      path,
      oldString,
      newString,
      replaceAll = false,
      status,
    }) => {
      await setStatus(context, {
        status: status ?? 'is editing file',
        loading: true,
      });
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);
        const params = {
          path,
          oldString: toBase64(oldString),
          newString: toBase64(newString),
          replaceAll,
        };

        const payload = toBase64Json(params);
        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', `PARAMS_B64='${payload}' python3 agent/bin/edit.py`],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: stderr || `Failed to edit file: ${path}`,
          };
        }

        const parsed = JSON.parse(stdout || '{}') as { replaced?: number };

        const response = {
          success: true,
          path,
          replaced: parsed.replaced ?? 0,
        };

        logger.debug(
          { ctxId, path, replaced: response.replaced },
          'Sandbox edit complete'
        );

        return response;
      } catch (error) {
        logger.error({ error, path }, 'Failed to edit file in sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
