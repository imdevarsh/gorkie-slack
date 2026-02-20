import { FileType, NotFoundError } from '@e2b/code-interpreter';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import { type SandboxToolDeps, setToolStatus, truncate } from './_shared';

const MAX_TEXT_CHARS = 40_000;
const MAX_DIR_ENTRIES = 400;

export const readFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Read a file or directory in the sandbox and return structured content.',
    inputSchema: z.object({
      filePath: z
        .string()
        .min(1)
        .describe('Absolute or relative path to read.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is reading files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ filePath, description }) => {
      await setToolStatus(context, description);
      const ctxId = getContextId(context);
      logger.info(
        {
          ctxId,
          input: { filePath, description },
        },
        '[subagent] reading file'
      );

      try {
        const info = await sandbox.files.getInfo(filePath);

        if (info.type === FileType.DIR) {
          const entries = await sandbox.files.list(filePath, { depth: 1 });
          const entryNames = entries.slice(0, MAX_DIR_ENTRIES).map((entry) => ({
            name: entry.name,
            path: entry.path,
            type: entry.type,
          }));

          return {
            success: true,
            path: filePath,
            type: 'directory',
            entries: entryNames,
            totalEntries: entries.length,
            truncated: entries.length > MAX_DIR_ENTRIES,
          };
        }

        const text = await sandbox.files.read(filePath);
        const output = {
          success: true,
          path: filePath,
          type: 'file',
          content: truncate(text, MAX_TEXT_CHARS),
          truncated: text.length > MAX_TEXT_CHARS,
        };

        logger.info(
          {
            ctxId,
            output,
          },
          '[subagent] read file'
        );

        return output;
      } catch (error) {
        logger.warn(
          {
            ctxId,
            output: {
              success: false,
              error: errorMessage(error),
            },
          },
          '[subagent] read file'
        );

        if (error instanceof NotFoundError) {
          return {
            success: false,
            error: `Path not found: ${filePath}`,
          };
        }

        logger.error(
          { ...toLogError(error), ctxId, filePath },
          '[sandbox-tool] Failed to read path'
        );

        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
