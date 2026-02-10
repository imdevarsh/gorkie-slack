import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './bash/sandbox';

export const edit = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Edit a file by exact string replacement.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
      oldString: z.string().describe('Exact string to replace'),
      newString: z.string().describe('Replacement string'),
      replaceAll: z
        .boolean()
        .default(false)
        .describe('Replace all occurrences (default: false)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ path, oldString, newString, replaceAll, status }) => {
      await setStatus(context, {
        status: status ?? 'is editing file',
        loading: true,
      });
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);
        const fileBuffer = await sandbox.readFileToBuffer({ path });

        if (!fileBuffer) {
          return { success: false, error: `File not found: ${path}` };
        }

        const data = fileBuffer.toString('utf-8');
        const count = data.split(oldString).length - 1;

        if (count === 0) {
          return { success: false, error: 'oldString not found' };
        }

        if (count > 1 && !replaceAll) {
          return {
            success: false,
            error: 'oldString found multiple times and replaceAll is false',
          };
        }

        const updated = replaceAll
          ? data.split(oldString).join(newString)
          : data.replace(oldString, newString);

        await sandbox.writeFiles([
          { path, content: Buffer.from(updated, 'utf-8') },
        ]);

        const response = {
          success: true,
          path,
          replaced: replaceAll ? count : 1,
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
