import { tool } from 'ai';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import { toChatSlackChannelId } from '@/lib/slack/ids';
import { assertReadableChannel, joinChannel } from './utils';

export function listThreadsTool({
  currentThreadId,
}: {
  currentThreadId: string;
}) {
  return tool({
    description:
      'List recent Slack channel threads so you can pick a thread id before reading it. The current channel always works (even if private); other channels must be public.',
    inputSchema: z.object({
      channelId: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    execute: async ({ channelId, cursor, limit }) => {
      const chatChannelId = toChatSlackChannelId(channelId);

      await assertReadableChannel(chatChannelId, { currentThreadId });

      await joinChannel(chatChannelId);

      const result = await slack.listThreads(chatChannelId, { cursor, limit });

      return {
        channelId: chatChannelId,
        nextCursor: result.nextCursor,
        threads: result.threads.map((thread) => {
          const message = thread.rootMessage;
          return {
            id: thread.id,
            lastReplyAt: thread.lastReplyAt?.toISOString(),
            replyCount: thread.replyCount,
            rootMessage: {
              id: message.id,
              threadId: message.threadId,
              text: message.text,
              author: {
                userId: message.author.userId,
                userName: message.author.userName,
                fullName: message.author.fullName,
                isBot: message.author.isBot,
                isMe: message.author.isMe,
              },
              dateSent: message.metadata.dateSent?.toISOString(),
              edited: message.metadata.edited,
              isMention: message.isMention,
              attachments: (message.attachments ?? []).map((attachment) => ({
                type: attachment.type,
                name: attachment.name,
                mimeType: attachment.mimeType,
                url: attachment.url,
              })),
            },
          };
        }),
      };
    },
  });
}
