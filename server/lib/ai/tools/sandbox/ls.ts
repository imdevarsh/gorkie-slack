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

const DEFAULT_LIMIT = 500;

export const listFiles = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'List a directory. Returns alphabetically sorted entries with "/" suffix for directories.',
    inputSchema: z.object({
      path: z
        .string()
        .default('.')
        .describe('Directory to list (relative or absolute).'),
      cwd: z
        .string()
        .optional()
        .describe('Base directory used when path is relative.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(5000)
        .default(DEFAULT_LIMIT)
        .describe('Maximum number of entries.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is listing files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ path, cwd, limit, description }) => {
      await setToolStatus(context, description);
      const targetPath = resolvePathInSandbox(path, cwd);
      logger.info(
        {
          input: { path, targetPath, limit, description },
        },
        '[subagent] listing files'
      );

      try {
        const info = await sandbox.files.getInfo(targetPath);
        if (info.type !== FileType.DIR) {
          return {
            success: false,
            error: `Not a directory: ${targetPath}`,
          };
        }

        const entries = await sandbox.files.list(targetPath, { depth: 1 });
        const names = entries
          .map((entry) =>
            entry.type === FileType.DIR ? `${entry.name}/` : entry.name
          )
          .sort((left, right) =>
            left.localeCompare(right, undefined, { sensitivity: 'base' })
          );

        const limited = names.slice(0, limit);
        const outputText = limited.join('\n');
        const truncation = truncateHead(outputText, {
          maxLines: Number.MAX_SAFE_INTEGER,
          maxBytes: DEFAULT_MAX_BYTES,
        });

        const notices: string[] = [];
        if (names.length > limit) {
          notices.push(
            `${limit} entries limit reached. Increase limit for more results.`
          );
        }
        if (truncation.truncated) {
          notices.push(
            `${formatSize(DEFAULT_MAX_BYTES)} output limit reached.`
          );
        }

        const output = {
          success: true,
          path: targetPath,
          entries: limited,
          count: names.length,
          output:
            notices.length > 0 && truncation.content.length > 0
              ? `${truncation.content}\n\n[${notices.join(' ')}]`
              : truncation.content,
          truncated: truncation.truncated || names.length > limit,
        };

        logger.info({ output }, '[subagent] list files');
        return output;
      } catch (error) {
        if (error instanceof NotFoundError) {
          return {
            success: false,
            error: `Path not found: ${targetPath}`,
          };
        }

        logger.error(
          { error, path: targetPath },
          '[sandbox-tool] List files failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
