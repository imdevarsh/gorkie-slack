import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import { type SandboxToolDeps, setToolStatus } from './_shared';

export const writeFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description: 'Write text content to a file in the sandbox.',
    inputSchema: z.object({
      filePath: z.string().min(1).describe('Path to write.'),
      content: z.string().describe('UTF-8 text content to write to the file.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is writing files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ filePath, content, description }) => {
      await setToolStatus(context, description);
      logger.info(
        {
          input: {
            filePath,
            description,
            bytes: Buffer.byteLength(content, 'utf8'),
          },
        },
        '[subagent] writing file'
      );

      try {
        await sandbox.files.write(filePath, content);
        const bytes = Buffer.byteLength(content, 'utf8');
        const output = {
          success: true,
          path: filePath,
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
          { error, filePath },
          '[sandbox-tool] Failed to write file'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
