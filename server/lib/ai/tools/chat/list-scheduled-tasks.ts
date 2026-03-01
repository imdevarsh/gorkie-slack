import { tool } from 'ai';
import { z } from 'zod';
import { listScheduledTasksByUser } from '~/db/queries/scheduled-tasks';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import type { SlackMessageContext, Stream } from '~/types';

export const listScheduledTasks = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'List your scheduled recurring tasks so you can review or manage them.',
    inputSchema: z.object({
      includeDisabled: z
        .boolean()
        .default(false)
        .describe('Include disabled/cancelled tasks in the results.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Maximum number of tasks to return.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Listing scheduled tasks',
        status: 'pending',
      });
    },
    execute: async ({ includeDisabled, limit }, { toolCallId }) => {
      const userId = context.event.user;
      if (!userId) {
        return {
          success: false,
          error: 'Could not identify the requesting user.',
        };
      }

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Listing scheduled tasks',
        details: includeDisabled ? 'Including disabled tasks' : 'Active tasks',
        status: 'in_progress',
      });

      const tasks = await listScheduledTasksByUser(userId, {
        includeDisabled,
        limit,
      });

      await finishTask(stream, {
        status: 'complete',
        taskId,
        output: `${tasks.length} task(s) found`,
      });

      return {
        success: true,
        tasks: tasks.map((item) => ({
          id: item.id,
          enabled: item.enabled,
          cronExpression: item.cronExpression,
          timezone: item.timezone,
          nextRunAt: item.nextRunAt.toISOString(),
          destinationType: item.destinationType,
          destinationId: item.destinationId,
          threadTs: item.threadTs,
          lastStatus: item.lastStatus,
          lastError: item.lastError,
          promptPreview:
            item.prompt.length > 140
              ? `${item.prompt.slice(0, 140)}...`
              : item.prompt,
        })),
      };
    },
  });
