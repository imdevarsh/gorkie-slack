import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { sandboxPath } from '~/lib/sandbox/utils';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const edit = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Edit a file by exact string replacement.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox'),
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
      const resolvedPath = sandboxPath(path);

      try {
        const sandbox = await getSandbox(context);
        const fileBuffer = await sandbox.fs
          .downloadFile(resolvedPath)
          .catch(() => null);

        if (!fileBuffer) {
          logger.warn(
            { path: resolvedPath, ctxId },
            '[sandbox] Edit missing file'
          );
          return { success: false, error: `File not found: ${resolvedPath}` };
        }

        const data = fileBuffer.toString('utf-8');
        const count = data.split(oldString).length - 1;

        if (count === 0) {
          logger.warn(
            { path: resolvedPath, ctxId },
            '[sandbox] Edit oldString not found'
          );
          return { success: false, error: 'oldString not found' };
        }

        if (count > 1 && !replaceAll) {
          logger.warn(
            { path: resolvedPath, count, ctxId },
            '[sandbox] Edit requires replaceAll'
          );
          return {
            success: false,
            error: 'oldString found multiple times and replaceAll is false',
          };
        }

        const updated = replaceAll
          ? data.replaceAll(oldString, newString)
          : data.replace(oldString, newString);

        await sandbox.fs.uploadFile(Buffer.from(updated, 'utf-8'), resolvedPath);

        const replaced = replaceAll ? count : 1;
        logger.debug(
          { path: resolvedPath, replaced, ctxId },
          '[sandbox] Edit completed'
        );

        return { success: true, path: resolvedPath, replaced };
      } catch (error) {
        logger.error(
          { error, path: resolvedPath, ctxId },
          '[sandbox] Edit failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
