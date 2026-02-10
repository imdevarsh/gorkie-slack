import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

export const scheduleReminder = ({
  context,
}: {
  context: SlackMessageContext;
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
      await setStatus(context, {
        status: 'is scheduling a reminder',
        loading: true,
      });
      const userId = (context.event as { user?: string }).user;

      if (!userId) {
        return {
          success: false,
          error: 'Something went wrong.',
        };
      }

      try {
        await context.client.chat.scheduleMessage({
          channel: userId,
          post_at: Math.floor(Date.now() / 1000) + seconds,
          markdown_text: text,
        });

        logger.info(
          {
            userId,
            text,
          },
          'Scheduled reminder'
        );

        return {
          success: true,
          content: `Scheduled reminder for ${userId} successfully`,
        };
      } catch (error) {
        logger.error({ error, userId }, 'Failed to schedule reminder');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
