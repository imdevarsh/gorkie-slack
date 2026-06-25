import { tool } from 'ai';
import { z } from 'zod';
import { toChatSlackChannelId } from '@/lib/slack/ids';
import { assertReadableChannel } from './utils';

export function getChannelInfoTool({
  currentThreadId,
}: {
  currentThreadId: string;
}) {
  return tool({
    description:
      'Fetch metadata for a channel: name, member count, DM status, visibility, etc.',
    inputSchema: z.object({
      channelId: z.string(),
    }),
    execute: async ({ channelId }) => {
      const chatChannelId = toChatSlackChannelId(channelId);
      const info = await assertReadableChannel(chatChannelId, {
        currentThreadId,
      });
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
