import { tool } from 'ai';
import { z } from 'zod';
import {
  countEnabledScheduledTasksByUser,
  createScheduledTask,
} from '~/db/queries/scheduled-tasks';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getNextRunAt, validateTimezone } from '~/lib/tasks/cron';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

const MAX_ENABLED_TASKS_PER_USER = 20;
const MIN_TASK_INTERVAL_MS = 30 * 60 * 1000;

export const scheduleTask = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Create a recurring cron-scheduled task. Use this for repeated automations that should run on a schedule and send output to a DM or channel.',
    inputSchema: z.object({
      task: z
        .string()
        .min(1)
        .max(2000)
        .describe('Task instructions to run on each schedule execution.'),
      cronExpression: z
        .string()
        .min(1)
        .max(120)
        .describe(
          'Cron expression for the schedule (5 or 6 fields, e.g. "0 9 * * 1-5").'
        ),
      timezone: z
        .string()
        .min(1)
        .max(120)
        .describe('IANA timezone name (for example, "America/Los_Angeles").'),
      destinationType: z
        .enum(['dm', 'channel'])
        .default('dm')
        .describe('Where run results should be delivered.'),
      channelId: z
        .string()
        .optional()
        .describe(
          'Required only for destinationType "channel". If omitted, current channel is used.'
        ),
      threadTs: z
        .string()
        .optional()
        .describe(
          'Optional thread timestamp for channel destination; outputs will post into this thread.'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Scheduling recurring task',
        status: 'pending',
      });
    },
    execute: async (
      { task, cronExpression, timezone, destinationType, channelId, threadTs },
      { toolCallId }
    ) => {
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
        title: 'Scheduling recurring task',
        details: cronExpression,
        status: 'in_progress',
      });

      try {
        validateTimezone(timezone);

        const enabledCount = await countEnabledScheduledTasksByUser(userId);
        if (enabledCount >= MAX_ENABLED_TASKS_PER_USER) {
          const limitMessage = `You already have ${MAX_ENABLED_TASKS_PER_USER} active scheduled tasks. Please disable one before creating another.`;
          await finishTask(stream, {
            status: 'error',
            taskId,
            output: limitMessage,
          });
          return {
            success: false,
            error: limitMessage,
          };
        }

        const destinationId =
          destinationType === 'dm'
            ? userId
            : (channelId ?? context.event.channel);

        if (!destinationId) {
          const missingMessage =
            'A destination channel is required for channel delivery.';
          await finishTask(stream, {
            status: 'error',
            taskId,
            output: missingMessage,
          });
          return {
            success: false,
            error: missingMessage,
          };
        }

        const now = new Date();
        const nextRunAt = getNextRunAt(cronExpression, timezone, now);
        const secondRunAt = getNextRunAt(
          cronExpression,
          timezone,
          new Date(nextRunAt.getTime() + 1000)
        );
        const intervalMs = secondRunAt.getTime() - nextRunAt.getTime();
        if (intervalMs < MIN_TASK_INTERVAL_MS) {
          const cadenceMessage =
            'Scheduled tasks must run at most once every 30 minutes.';
          await finishTask(stream, {
            status: 'error',
            taskId,
            output: cadenceMessage,
          });
          return {
            success: false,
            error: cadenceMessage,
          };
        }

        const createdTaskId = crypto.randomUUID();

        await createScheduledTask({
          id: createdTaskId,
          creatorUserId: userId,
          destinationType,
          destinationId,
          threadTs: destinationType === 'channel' ? (threadTs ?? null) : null,
          prompt: task,
          cronExpression,
          timezone,
          enabled: true,
          nextRunAt,
          runningAt: null,
          lastRunAt: null,
          lastStatus: 'scheduled',
          lastError: null,
        });

        logger.info(
          {
            ctxId,
            taskId: createdTaskId,
            creatorUserId: userId,
            destinationType,
            destinationId,
            threadTs: destinationType === 'channel' ? threadTs : undefined,
            cronExpression,
            timezone,
            nextRunAt,
          },
          'Created scheduled task'
        );

        await finishTask(stream, {
          status: 'complete',
          taskId,
          output: `Next run: ${nextRunAt.toISOString()}`,
        });

        return {
          success: true,
          taskId: createdTaskId,
          content: `Scheduled recurring task to ${destinationType === 'dm' ? 'your DM' : destinationId}. Next run: ${nextRunAt.toISOString()} (${timezone}).`,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, cronExpression, timezone },
          'Failed to create scheduled task'
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
