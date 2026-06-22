import { tool } from 'ai';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import {
  parseSlackThreadId,
  toChatChannelId,
  toRawChannelId,
} from '@/lib/slack/ids';
import { assertPublicChannel, joinChannel } from './utils';

export function readConversationHistoryTool() {
  return tool({
    description:
      'Read message history from a public Slack channel or thread using a channel ID and optional thread timestamp.',
    inputSchema: z.object({
      channelId: z
        .string()
        .optional()
        .describe('Slack channel id, e.g. C123456 or slack:C123456.'),
      threadId: z
        .string()
        .optional()
        .describe(
          'Optional full Chat SDK thread id, e.g. slack:C123456:1781599802.270109.'
        ),
      threadTs: z
        .string()
        .optional()
        .describe('Optional Slack thread timestamp to read replies.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(40)
        .describe('Maximum messages to read.'),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
    }),
    execute: async ({ channelId, cursor, limit, threadId, threadTs }) => {
      const parsedThread = threadId ? parseSlackThreadId(threadId) : undefined;
      const resolvedChannelId = channelId ?? parsedThread?.channelId;
      const resolvedThreadTs = threadTs ?? parsedThread?.threadTs;
      if (!resolvedChannelId) {
        throw new Error(
          'readConversationHistory needs channelId, or a full threadId like slack:C123456:1781599802.270109.'
        );
      }

      const slackChannelId = toRawChannelId(resolvedChannelId);
      if (!slackChannelId) {
        throw new Error(
          `${resolvedChannelId} is not a Slack channel id. Use a value like C123456 or slack:C123456.`
        );
      }

      const chatChannelId = toChatChannelId(slackChannelId);
      await assertPublicChannel(chatChannelId);

      await joinChannel(slackChannelId);

      const result = resolvedThreadTs
        ? await slack.fetchMessages(
            `slack:${slackChannelId}:${resolvedThreadTs}`,
            {
              cursor,
              limit,
            }
          )
        : await slack.fetchChannelMessages(chatChannelId, {
            cursor,
            limit,
          });

      return {
        channelId: chatChannelId,
        messages: result.messages.map((message) => ({
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
        })),
        nextCursor: result.nextCursor,
        threadTs: resolvedThreadTs ?? null,
      };
    },
  });
}
