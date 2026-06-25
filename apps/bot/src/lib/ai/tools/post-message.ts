import { tool } from 'ai';
import type { Chat } from 'chat';
import { z } from 'zod';

export function postMessageTool({ bot }: { bot: Chat }) {
  return tool({
    description:
      'Post a markdown-formatted message to another target. Type must be thread, channel, or user.',
    inputSchema: z.object({
      type: z
        .enum(['thread', 'channel', 'user'])
        .describe('Target kind: thread, channel, or user.'),
      id: z.string().min(1),
      message: z.string().min(1).describe('Markdown message body.'),
    }),
    execute: async ({ id, message, type }) => {
      if (type === 'thread') {
        const sent = await bot.thread(id).post({ markdown: message });
        return { messageId: sent.id, threadId: sent.threadId };
      }
      if (type === 'channel') {
        const sent = await bot.channel(id).post({ markdown: message });
        return { messageId: sent.id, threadId: sent.threadId };
      }
      const dm = await bot.openDM(id);
      const sent = await dm.post({ markdown: message });
      return { messageId: sent.id, threadId: sent.threadId };
    },
  });
}
