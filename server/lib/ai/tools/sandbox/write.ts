import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SandboxToolDeps } from './_shared';

export const writeFile = ({ context, sandbox, stream }: SandboxToolDeps) =>
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
      const ctxId = getContextId(context);
      const task = await createTask(stream, {
        title: description,
        details: filePath,
      });
      logger.info(
        {
          ctxId,
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
            ctxId,
            output,
          },
          '[subagent] write file'
        );

        await finishTask(
          stream,
          task,
          'complete',
          `${bytes} bytes written to ${filePath}`
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
          '[subagent] write file'
        );

        logger.error(
          { ...toLogError(error), ctxId, filePath },
          '[sandbox-tool] Failed to write file'
        );
        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
