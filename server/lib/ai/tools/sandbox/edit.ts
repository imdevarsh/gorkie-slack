import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolvePathInSandbox,
  type SandboxToolDeps,
  setToolStatus,
} from './_shared';

function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIndex = content.indexOf('\r\n');
  const lfIndex = content.indexOf('\n');
  if (lfIndex === -1 || (crlfIndex !== -1 && crlfIndex < lfIndex)) {
    return '\r\n';
  }

  return '\n';
}

function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

export const editFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Edit a text file by replacing exact text. Optional replaceAll supports global replacements.',
    inputSchema: z.object({
      filePath: z.string().min(1).describe('Path to edit.'),
      cwd: z
        .string()
        .optional()
        .describe('Base directory used when filePath is relative.'),
      oldText: z.string().min(1).describe('Exact text to replace.'),
      newText: z.string().describe('Replacement text.'),
      replaceAll: z
        .boolean()
        .default(false)
        .describe(
          'Replace all occurrences if true. If false, oldText must match exactly once.'
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
      cwd,
      oldText,
      newText,
      replaceAll,
      description,
    }) => {
      await setToolStatus(context, description);
      const resolvedPath = resolvePathInSandbox(filePath, cwd);

      logger.info(
        {
          input: {
            filePath,
            resolvedPath,
            description,
            replaceAll,
            oldPreview: oldText.slice(0, 100),
            newPreview: newText.slice(0, 100),
          },
        },
        '[subagent] editing file'
      );

      try {
        const rawContent = await sandbox.files.read(resolvedPath);
        const content = rawContent.startsWith('\uFEFF')
          ? rawContent.slice(1)
          : rawContent;

        const lineEnding = detectLineEnding(content);
        const normalizedContent = normalizeToLf(content);
        const normalizedOldText = normalizeToLf(oldText);
        const normalizedNewText = normalizeToLf(newText);

        const occurrences =
          normalizedContent.split(normalizedOldText).length - 1;
        if (occurrences === 0) {
          return {
            success: false,
            error: 'oldText not found in file',
            path: resolvedPath,
          };
        }

        if (!replaceAll && occurrences > 1) {
          return {
            success: false,
            error:
              'oldText appears multiple times; provide more context or set replaceAll=true',
            path: resolvedPath,
            occurrences,
          };
        }

        const normalizedNext = replaceAll
          ? normalizedContent.split(normalizedOldText).join(normalizedNewText)
          : normalizedContent.replace(normalizedOldText, normalizedNewText);

        if (normalizedNext === normalizedContent) {
          return {
            success: false,
            error: 'No changes produced by replacement',
            path: resolvedPath,
          };
        }

        const next = restoreLineEndings(normalizedNext, lineEnding);
        const finalContent = rawContent.startsWith('\uFEFF')
          ? `\uFEFF${next}`
          : next;
        await sandbox.files.write(resolvedPath, finalContent);

        const output = {
          success: true,
          path: resolvedPath,
          replacements: replaceAll ? occurrences : 1,
        };

        logger.info(
          {
            output,
          },
          '[subagent] edit file'
        );

        return output;
      } catch (error) {
        logger.warn(
          {
            output: {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          '[subagent] edit file'
        );

        logger.error(
          { error, filePath: resolvedPath },
          '[sandbox-tool] Failed to edit file'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
