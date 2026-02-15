import { FileType, NotFoundError } from '@e2b/code-interpreter';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
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
        return {
          success: true,
          path: filePath,
          type: 'file',
          content: truncate(text, MAX_TEXT_CHARS),
          truncated: text.length > MAX_TEXT_CHARS,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return {
            success: false,
            error: `Path not found: ${filePath}`,
          };
        }

        logger.error({ error, filePath }, '[sandbox-tool] Failed to read path');

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
