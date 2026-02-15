import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import { type SandboxToolDeps, setToolStatus } from './_shared';

export const editFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Edit a text file by replacing exact text. Use replaceAll for global edits.',
    inputSchema: z.object({
      filePath: z.string().min(1).describe('Path to edit.'),
      oldText: z.string().min(1).describe('Exact text to replace.'),
      newText: z.string().describe('Replacement text.'),
      replaceAll: z
        .boolean()
        .default(false)
        .describe(
          'Replace all occurrences if true, only first occurrence if false.'
        ),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is editing files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({
      filePath,
      oldText,
      newText,
      replaceAll,
      description,
    }) => {
      await setToolStatus(context, description);

      try {
        const current = await sandbox.files.read(filePath);

        if (!current.includes(oldText)) {
          return {
            success: false,
            error: 'oldText not found in file',
            path: filePath,
          };
        }

        const next = replaceAll
          ? current.split(oldText).join(newText)
          : current.replace(oldText, newText);

        await sandbox.files.write(filePath, next);

        const occurrences = replaceAll ? current.split(oldText).length - 1 : 1;

        return {
          success: true,
          path: filePath,
          replacements: occurrences,
        };
      } catch (error) {
        logger.error({ error, filePath }, '[sandbox-tool] Failed to edit file');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
