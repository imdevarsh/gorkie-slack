import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import { createTask, finishTask } from '~/lib/ai/utils/task';
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
    execute: async ({ text, seconds }) => {
      const ctxId = getContextId(context);
      const userId = (context.event as { user?: string }).user;

      if (!userId) {
        return {
          success: false,
          error: 'Something went wrong.',
        };
      }

      const task = await createTask(stream, {
        title: 'Scheduling reminder',
        details: `in ${seconds}s: ${text.slice(0, 60)}`,
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
        await finishTask(stream, task, 'complete', `Scheduled for ${userId}`);
        return {
          success: true,
          content: `Scheduled reminder for ${userId} successfully`,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, userId },
          'Failed to schedule reminder'
        );
        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
