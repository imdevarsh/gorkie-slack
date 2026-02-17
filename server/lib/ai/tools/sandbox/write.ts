import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolvePathInSandbox,
  type SandboxToolDeps,
  setToolStatus,
  shellEscape,
} from './_shared';

export const writeFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Write text content to a file in the sandbox. Creates parent directories if needed.',
    inputSchema: z.object({
      filePath: z.string().min(1).describe('Path to write.'),
      cwd: z
        .string()
        .optional()
        .describe('Base directory used when filePath is relative.'),
      content: z.string().describe('UTF-8 text content to write to the file.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is writing files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ filePath, cwd, content, description }) => {
      await setToolStatus(context, description);
      const resolvedPath = resolvePathInSandbox(filePath, cwd);
      logger.info(
        {
          input: {
            filePath,
            resolvedPath,
            description,
            bytes: Buffer.byteLength(content, 'utf8'),
          },
        },
        '[subagent] writing file'
      );

      try {
        const parentDir = path.posix.dirname(resolvedPath);
        await sandbox.commands.run(
          `bash -lc ${shellEscape(`mkdir -p ${shellEscape(parentDir)}`)}`,
          {
            cwd: parentDir,
          }
        );

        await sandbox.files.write(resolvedPath, content);
        const bytes = Buffer.byteLength(content, 'utf8');
        const output = {
          success: true,
          path: resolvedPath,
          bytes,
        };

        logger.info(
          {
            output,
          },
          '[subagent] write file'
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
          '[subagent] write file'
        );

        logger.error(
          { error, filePath: resolvedPath },
          '[sandbox-tool] Failed to write file'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
