import { tool } from 'ai';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import { toChatSlackChannelId } from '@/lib/slack/ids';
import { assertReadableChannel, joinChannel } from './utils';

export function readConversationHistoryTool({
  currentThreadId,
}: {
  currentThreadId: string;
}) {
  return tool({
    description:
      'Read channel history or thread replies. The current conversation is always readable; other channels must be public.',
    inputSchema: z.object({
      channelId: z.string().optional(),
      threadId: z.string().optional(),
      threadTs: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(40),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
    }),
    execute: async ({ channelId, cursor, limit, threadId, threadTs }) => {
      const decodedThread = threadId
        ? slack.decodeThreadId(threadId)
        : undefined;
      const resolvedChannelId =
        channelId ??
        (threadId ? slack.channelIdFromThreadId(threadId) : undefined);
      const resolvedThreadTs = threadTs ?? decodedThread?.threadTs;
      if (!resolvedChannelId) {
        throw new Error('readConversationHistory needs channelId or threadId.');
      }

      const chatChannelId = toChatSlackChannelId(resolvedChannelId);

      await assertReadableChannel(chatChannelId, { currentThreadId });

      await joinChannel(chatChannelId);

      const result = resolvedThreadTs
        ? await slack.fetchMessages(`${chatChannelId}:${resolvedThreadTs}`, {
            cursor,
            limit,
          })
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
