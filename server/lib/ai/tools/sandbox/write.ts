import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
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
        .default('Writing files')
        .describe(
          'Brief title for this operation, e.g. "Writing package.json", "Creating config file".'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Writing files',
        status: 'pending',
      });
    },
    execute: async ({ filePath, content, description }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: description,
        details: filePath,
        status: 'in_progress',
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
