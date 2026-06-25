import { bot, slack } from '@/lib/chat';
import { toRawSlackChannelId } from '@/lib/slack/ids';

export async function assertReadableChannel(
  chatChannelId: string,
  options?: { currentThreadId?: string }
) {
  const currentChannelId = options?.currentThreadId
    ? slack.channelIdFromThreadId(options.currentThreadId)
    : undefined;
  const metadata = await bot.channel(chatChannelId).fetchMetadata();
  if (currentChannelId && chatChannelId === currentChannelId) {
    return metadata;
  }
  if (metadata.isDM || metadata.channelVisibility !== 'workspace') {
    throw new Error(
      'Reading DMs, private channels, or external conversations is not allowed.'
    );
  }
  return metadata;
}

export async function joinChannel(channelId: string): Promise<unknown> {
  try {
    return await slack.webClient.apiCall('conversations.join', {
      channel: toRawSlackChannelId(channelId),
    });
  } catch {
    return;
  }
}
