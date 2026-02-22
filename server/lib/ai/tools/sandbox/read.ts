import { FileType, NotFoundError } from '@e2b/code-interpreter';
import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import { type SandboxToolDeps, truncate } from './_shared';

const MAX_TEXT_CHARS = 40_000;
const MAX_DIR_ENTRIES = 400;

export const readFile = ({ context, sandbox, stream }: SandboxToolDeps) =>
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
        .default('Reading files')
        .describe(
          'Brief title for this operation, e.g. "Reading package.json", "Listing src directory".'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Reading files',
        status: 'pending',
      });
    },
    execute: async ({ filePath, description }, { toolCallId }) => {
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

          await finishTask(stream, {
            status: 'complete',
            taskId: task,
            output: `${entries.length} entries`,
          });
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

        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `${text.length} chars`,
        });
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
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: `Path not found: ${filePath}`,
          });
          return {
            success: false,
            error: `Path not found: ${filePath}`,
          };
        }

        logger.error(
          { ...toLogError(error), ctxId, filePath },
          '[sandbox-tool] Failed to read path'
        );

        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: errorMessage(error),
        });
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
