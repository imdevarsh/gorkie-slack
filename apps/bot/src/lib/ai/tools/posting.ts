import { type ToolSet, tool } from 'ai';
import type { Chat } from 'chat';
import { z } from 'zod';

const postableInputSchema = z.union([
  z.string().min(1).describe('Markdown body.'),
  z.object({ markdown: z.string().min(1) }).describe('Markdown body.'),
  z.object({ raw: z.string().min(1) }).describe('Raw body.'),
]);

type MarkdownPostable = z.infer<typeof postableInputSchema>;

function toMarkdownPostable(
  message: MarkdownPostable
): { markdown: string } | { raw: string } {
  if (typeof message === 'string') {
    return { markdown: message };
  }
  return message;
}

export function postingTools({ bot }: { bot: Chat }): ToolSet {
  return {
    postMessage: tool({
      description:
        'Post a markdown-formatted reply inside an existing thread. Use a full Chat SDK thread id like slack:C123:1234567890.123456.',
      inputSchema: z.object({
        threadId: z.string().min(1).describe('Full Chat SDK thread id.'),
        message: postableInputSchema,
      }),
      execute: async ({ threadId, message }) => {
        const sent = await bot
          .thread(threadId)
          .post(toMarkdownPostable(message));
        return { messageId: sent.id, threadId: sent.threadId };
      },
    }),
    postChannelMessage: tool({
      description:
        'Post a markdown-formatted top-level message to a channel. Use a full Chat SDK channel id like slack:C123.',
      inputSchema: z.object({
        channelId: z.string().min(1).describe('Full Chat SDK channel id.'),
        message: postableInputSchema,
      }),
      execute: async ({ channelId, message }) => {
        const sent = await bot
          .channel(channelId)
          .post(toMarkdownPostable(message));
        return { messageId: sent.id, threadId: sent.threadId };
      },
    }),
    sendDirectMessage: tool({
      description:
        'Open or reuse a direct message with a user and post a markdown-formatted message.',
      inputSchema: z.object({
        userId: z.string().min(1).describe('Platform-native user id.'),
        message: postableInputSchema,
      }),
      execute: async ({ userId, message }) => {
        const dm = await bot.openDM(userId);
        const sent = await dm.post(toMarkdownPostable(message));
        return { messageId: sent.id, threadId: sent.threadId };
      },
    }),
  };
}
