import { tool } from 'ai';
import { formatDistanceToNow } from 'date-fns';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

export const scheduleReminder = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Schedule a reminder to be sent to the user who sent the last message in the conversation.',
    inputSchema: z.object({
      text: z
        .string()
        .describe(
          "The text of the reminder message that will be sent to the user. For example, 'Hi there! 1 hour ago, you asked me to remind you to update your computer.'"
        ),
      seconds: z
        .number()
        .describe(
          'The number of seconds to wait before sending the reminder from the current time.'
        )
        .max(
          // 120 days
          120 * 24 * 60 * 60
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Scheduling reminder',
        status: 'pending',
      });
    },
    execute: async ({ text, seconds }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const userId = (context.event as { user?: string }).user;

      if (!userId) {
        return {
          success: false,
          error: 'Something went wrong.',
        };
      }

      const scheduledFor = new Date(Date.now() + seconds * 1000);
      const relativeTime = formatDistanceToNow(scheduledFor, {
        addSuffix: true,
      });

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Scheduling reminder',
        details: `${relativeTime}: ${text.slice(0, 60)}`,
        status: 'in_progress',
      });

      try {
        await context.client.chat.scheduleMessage({
          channel: userId,
          post_at: Math.floor(Date.now() / 1000) + seconds,
          markdown_text: text,
        });

        logger.info(
          {
            ctxId,
            userId,
            text,
          },
          'Scheduled reminder'
        );
        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `Scheduled for ${userId}`,
        });
        return {
          success: true,
          content: `Scheduled reminder for ${userId} successfully`,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, userId },
          'Failed to schedule reminder'
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
