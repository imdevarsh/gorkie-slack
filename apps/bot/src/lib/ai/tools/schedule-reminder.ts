import { tool } from 'ai';
import type { Message } from 'chat';
import { z } from 'zod';
import { bot } from '@/lib/chat';
import { errorMessage } from '@/lib/utils/error';

export function scheduleReminderTool({ message }: { message: Message }) {
  return tool({
    description:
      'Schedule a one-time reminder DM to the user who sent the current message.',
    inputSchema: z.object({
      text: z.string().min(1).max(3000),
      seconds: z
        .number()
        .int()
        .min(1)
        .max(120 * 24 * 60 * 60),
    }),
    execute: async ({ text, seconds }) => {
      const postAt = new Date(Date.now() + seconds * 1000);
      try {
        const dm = await bot.openDM(message.author);
        await dm.schedule({ markdown: text }, { postAt });
        return {
          scheduledFor: postAt.toISOString(),
          success: true,
          userId: message.author.userId,
        };
      } catch (error) {
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
