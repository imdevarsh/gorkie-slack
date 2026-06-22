import { bot, slack } from '@/lib/chat';

// Guards against reading DMs, private channels, or external conversations.
// fetchMetadata is an authoritative platform lookup, so visibility is accurate
// even for channels the adapter hasn't cached yet (unlike getChannelVisibility).
export async function assertPublicChannel(
  chatChannelId: string
): Promise<void> {
  const metadata = await bot.channel(chatChannelId).fetchMetadata();
  if (metadata.isDM || metadata.channelVisibility !== 'workspace') {
    throw new Error(
      'Reading DMs, private channels, or external conversations is not allowed.'
    );
  }
}

export async function joinChannel(slackChannelId: string): Promise<unknown> {
  try {
    return await slack.webClient.apiCall('conversations.join', {
      channel: slackChannelId,
    });
  } catch {
    return;
  }
}
