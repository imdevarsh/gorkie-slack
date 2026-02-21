import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SandboxToolDeps } from './_shared';

export const editFile = ({ context, sandbox, stream }: SandboxToolDeps) =>
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
        .default('Editing files')
        .describe(
          'Brief title for this operation, e.g. "Editing main.ts", "Updating config".'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Editing files',
        status: 'pending',
      });
    },
    execute: async ({
      filePath,
      oldText,
      newText,
      replaceAll,
      description,
    }, { toolCallId }) => {
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
            replaceAll,
            oldPreview: oldText.slice(0, 100),
            newPreview: newText.slice(0, 100),
          },
        },
        '[subagent] editing file'
      );

      try {
        const current = await sandbox.files.read(filePath);

        if (!current.includes(oldText)) {
          await finishTask(stream, task, 'error', 'oldText not found in file');
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

        const output = {
          success: true,
          path: filePath,
          replacements: occurrences,
        };

        logger.info(
          {
            ctxId,
            output,
          },
          '[subagent] edit file'
        );

        await finishTask(
          stream,
          task,
          'complete',
          `${output.replacements} replacement(s) in ${filePath}`
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
          '[subagent] edit file'
        );

        logger.error(
          { ...toLogError(error), ctxId, filePath },
          '[sandbox-tool] Failed to edit file'
        );
        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
