import { errorMessage } from '@repo/utils/error';
import { tool } from 'ai';
import type { Message } from 'chat';
import { z } from 'zod';
import { slack } from '@/lib/chat';

export function scheduleReminderTool({ message }: { message: Message }) {
  return tool({
    description:
      'Schedule a one-time reminder DM to the user who sent the current message. Use scheduleTask for recurring reminders once available.',
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(3000)
        .describe('Reminder message text to send to the user.'),
      seconds: z
        .number()
        .int()
        .min(1)
        .max(120 * 24 * 60 * 60)
        .describe('Seconds from now to send the reminder.'),
    }),
    execute: async ({ text, seconds }) => {
      const postAt = Math.floor(Date.now() / 1000) + seconds;
      try {
        await slack.webClient.apiCall('chat.scheduleMessage', {
          channel: message.author.userId,
          post_at: postAt,
          text,
        });
        return {
          postAt,
          scheduledFor: new Date(postAt * 1000).toISOString(),
          success: true,
          userId: message.author.userId,
        };
      } catch (error) {
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
