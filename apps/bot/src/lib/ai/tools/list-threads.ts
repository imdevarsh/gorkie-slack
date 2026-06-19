import { tool } from 'ai';
import type { Chat } from 'chat';
import { z } from 'zod';
import { slack } from '@/lib/chat';

export function listThreadsTool({ bot }: { bot: Chat }) {
  return tool({
    description:
      'List recent public Slack channel threads so you can pick a thread id before reading it.',
    inputSchema: z.object({
      channelId: z
        .string()
        .describe('Slack channel id, e.g. C123456 or slack:C123456.'),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Maximum thread roots to return.'),
    }),
    execute: async ({ channelId, cursor, limit }) => {
      const slackChannelId = channelId.startsWith('slack:')
        ? channelId.split(':')[1]
        : channelId;
      if (!slackChannelId) {
        throw new Error(
          `${channelId} is not a Slack channel id. Use a value like C123456 or slack:C123456.`
        );
      }

      const chatChannelId = `slack:${slackChannelId}`;
      const metadata = await bot.channel(chatChannelId).fetchMetadata();
      if (metadata.isDM || metadata.channelVisibility !== 'workspace') {
        throw new Error(
          'Reading DMs, private channels, or external conversations is not allowed.'
        );
      }

      await slack.webClient
        .apiCall('conversations.join', { channel: slackChannelId })
        .catch(() => undefined);

      const result = await slack.listThreads(chatChannelId, { cursor, limit });

      return {
        channelId: chatChannelId,
        nextCursor: result.nextCursor,
        threads: result.threads.map((thread) => ({
          id: thread.id,
          lastReplyAt: thread.lastReplyAt?.toISOString(),
          replyCount: thread.replyCount,
          rootMessage: {
            id: thread.rootMessage.id,
            threadId: thread.rootMessage.threadId,
            text: thread.rootMessage.text,
            author: {
              userId: thread.rootMessage.author.userId,
              userName: thread.rootMessage.author.userName,
              fullName: thread.rootMessage.author.fullName,
              isBot: thread.rootMessage.author.isBot,
              isMe: thread.rootMessage.author.isMe,
            },
            dateSent: thread.rootMessage.metadata.dateSent?.toISOString(),
            edited: thread.rootMessage.metadata.edited,
            isMention: thread.rootMessage.isMention,
            attachments: (thread.rootMessage.attachments ?? []).map(
              (attachment) => ({
                type: attachment.type,
                name: attachment.name,
                mimeType: attachment.mimeType,
                url: attachment.url,
              })
            ),
          },
        })),
      };
    },
  });
}
