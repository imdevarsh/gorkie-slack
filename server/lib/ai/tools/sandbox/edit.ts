import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

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
        const sandbox = await getSandbox(context);
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
          ? data.replaceAll(oldString, newString)
          : data.replace(oldString, newString);

        await sandbox.writeFiles([
          { path, content: Buffer.from(updated, 'utf-8') },
        ]);

        const replaced = replaceAll ? count : 1;
        logger.debug(
          { path, replaced, ctxId },
          `Replaced ${replaced} occurrence${replaced > 1 ? 's' : ''} in ${path}`
        );

        return { success: true, path, replaced };
      } catch (error) {
        logger.error({ error, path, ctxId }, `Failed to edit ${path}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
