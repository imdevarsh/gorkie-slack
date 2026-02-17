import { FileType, NotFoundError } from '@e2b/code-interpreter';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolvePathInSandbox,
  type SandboxToolDeps,
  setToolStatus,
} from './_shared';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from './truncate';

const DEFAULT_DIR_ENTRIES = 400;

export const readFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Read a file or directory in the sandbox. Supports pagination for large files.',
    inputSchema: z.object({
      filePath: z
        .string()
        .min(1)
        .describe('Absolute or relative path to read.'),
      cwd: z
        .string()
        .optional()
        .describe('Base directory used when filePath is relative.'),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Line number to start reading from (1-indexed).'),
      limit: z
        .number()
        .int()
        .positive()
        .max(10_000)
        .optional()
        .describe('Max lines to read from offset before truncation.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is reading files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ filePath, cwd, offset, limit, description }) => {
      await setToolStatus(context, description);
      const resolvedPath = resolvePathInSandbox(filePath, cwd);
      logger.info(
        {
          input: { filePath, resolvedPath, cwd, offset, limit, description },
        },
        '[subagent] reading file'
      );

      try {
        const info = await sandbox.files.getInfo(resolvedPath);

        if (info.type === FileType.DIR) {
          const entries = await sandbox.files.list(resolvedPath, { depth: 1 });
          const entryNames = entries
            .map((entry) =>
              entry.type === FileType.DIR ? `${entry.name}/` : entry.name
            )
            .sort((left, right) =>
              left.localeCompare(right, undefined, { sensitivity: 'base' })
            );
          const limited = entryNames.slice(0, DEFAULT_DIR_ENTRIES);

          return {
            success: true,
            path: resolvedPath,
            type: 'directory',
            entries: limited,
            output: limited.join('\n'),
            totalEntries: entryNames.length,
            truncated: entryNames.length > DEFAULT_DIR_ENTRIES,
          };
        }

        const text = await sandbox.files.read(resolvedPath);
        const allLines = text.split('\n');
        const totalLines = allLines.length;

        const startLine = Math.max(0, (offset ?? 1) - 1);
        if (startLine >= totalLines) {
          return {
            success: false,
            error: `Offset ${offset} is beyond end of file (${totalLines} lines total)`,
            path: resolvedPath,
          };
        }

        const selected =
          limit !== undefined
            ? allLines.slice(startLine, Math.min(startLine + limit, totalLines))
            : allLines.slice(startLine);

        const selectedText = selected.join('\n');
        const truncation = truncateHead(selectedText);

        let outputText = truncation.content;
        const startDisplay = startLine + 1;
        if (truncation.firstLineExceedsLimit) {
          outputText =
            `[Line ${startDisplay} exceeds ${formatSize(DEFAULT_MAX_BYTES)}.] ` +
            'Use bash with sed/head to read a partial line.';
        } else if (truncation.truncated) {
          const endDisplay = startDisplay + truncation.outputLines - 1;
          const nextOffset = endDisplay + 1;
          outputText += `\n\n[Showing lines ${startDisplay}-${endDisplay} of ${totalLines}. Use offset=${nextOffset} to continue.]`;
        } else if (
          limit !== undefined &&
          startLine + selected.length < totalLines
        ) {
          const nextOffset = startLine + selected.length + 1;
          outputText += `\n\n[More lines available. Use offset=${nextOffset} to continue.]`;
        }

        const output = {
          success: true,
          path: resolvedPath,
          type: 'file',
          content: outputText,
          totalLines,
          truncated: truncation.truncated,
        };

        logger.info(
          {
            output: {
              success: output.success,
              path: output.path,
              type: output.type,
              totalLines: output.totalLines,
              truncated: output.truncated,
            },
          },
          '[subagent] read file'
        );

        return output;
      } catch (error) {
        if (error instanceof NotFoundError) {
          return {
            success: false,
            error: `Path not found: ${resolvedPath}`,
          };
        }

        logger.error(
          { error, filePath: resolvedPath },
          '[sandbox-tool] Failed to read path'
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
