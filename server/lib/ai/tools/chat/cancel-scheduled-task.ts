import { tool } from 'ai';
import { z } from 'zod';
import {
  cancelScheduledTaskForUser,
  getScheduledTaskByIdForUser,
} from '~/db/queries/scheduled-tasks';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

export const cancelScheduledTask = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Cancel (disable) one of your scheduled recurring tasks so it stops running.',
    inputSchema: z.object({
      taskId: z.string().min(1).describe('The scheduled task ID to cancel.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Cancelling scheduled task',
        status: 'pending',
      });
    },
    execute: async ({ taskId: targetTaskId }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const userId = context.event.user;

      if (!userId) {
        return {
          success: false,
          error: 'Could not identify the requesting user.',
        };
      }

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Cancelling scheduled task',
        details: targetTaskId,
        status: 'in_progress',
      });

      try {
        const cancelled = await cancelScheduledTaskForUser(
          targetTaskId,
          userId
        );
        if (cancelled) {
          logger.info(
            { ctxId, userId, taskId: targetTaskId },
            'Cancelled scheduled task'
          );
          await finishTask(stream, {
            status: 'complete',
            taskId,
            output: `Cancelled ${targetTaskId}`,
          });
          return {
            success: true,
            content: `Cancelled scheduled task ${targetTaskId}.`,
          };
        }

        const existing = await getScheduledTaskByIdForUser(
          targetTaskId,
          userId
        );
        if (!existing) {
          await finishTask(stream, {
            status: 'error',
            taskId,
            output: 'Task not found',
          });
          return {
            success: false,
            error: `No scheduled task found with ID ${targetTaskId}.`,
          };
        }

        if (!existing.enabled) {
          await finishTask(stream, {
            status: 'complete',
            taskId,
            output: 'Already cancelled',
          });
          return {
            success: true,
            content: `Scheduled task ${targetTaskId} is already cancelled.`,
          };
        }

        await finishTask(stream, {
          status: 'error',
          taskId,
          output: 'Could not cancel task',
        });
        return {
          success: false,
          error: `Could not cancel scheduled task ${targetTaskId}.`,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, userId, taskId: targetTaskId },
          'Failed to cancel scheduled task'
        );
        await finishTask(stream, {
          status: 'error',
          taskId,
          output: errorMessage(error),
        });
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
