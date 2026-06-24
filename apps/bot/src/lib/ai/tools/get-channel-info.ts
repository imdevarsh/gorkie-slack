import { tool } from 'ai';
import type { Chat } from 'chat';
import { z } from 'zod';
import { slack } from '@/lib/chat';
import { toChatSlackChannelId } from '@/lib/slack/ids';

export function getChannelInfoTool({
  bot,
  currentThreadId,
}: {
  bot: Chat;
  currentThreadId: string;
}) {
  return tool({
    description:
      'Fetch metadata for a channel: name, member count, DM status, visibility, etc.',
    inputSchema: z.object({
      channelId: z
        .string()
        .describe('Chat SDK channel id, e.g. slack:C123456.'),
    }),
    execute: async ({ channelId }) => {
      const chatChannelId = toChatSlackChannelId(channelId);
      const info = await bot.channel(chatChannelId).fetchMetadata();
      if (
        slack.channelIdFromThreadId(currentThreadId) !== chatChannelId &&
        (info.isDM || info.channelVisibility !== 'workspace')
      ) {
        throw new Error(
          'Reading DMs, private channels, or external conversations is not allowed.'
        );
      }
      return {
        id: info.id,
        name: info.name,
        isDM: info.isDM ?? false,
        memberCount: info.memberCount,
        channelVisibility: info.channelVisibility,
      };
    },
  });
}
