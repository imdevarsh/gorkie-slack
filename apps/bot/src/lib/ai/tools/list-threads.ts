import { tool } from 'ai';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import { assertReadableChannel, joinChannel } from './utils';

export function listThreadsTool() {
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
      assertReadableChannel(chatChannelId);

      await joinChannel(slackChannelId);

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
