import { slack } from '@/lib/chat';

// Guards against reading DMs, private channels, or external conversations, using
// the Slack adapter's synchronous prefix checks (no I/O). `getChannelVisibility`
// only reports `external` once the adapter has cached the channel, so an uncached
// Slack Connect channel reads as `workspace`; the DM and private-channel checks
// are always reliable.
export function assertReadableChannel(chatChannelId: string): void {
  if (
    slack.isDM(chatChannelId) ||
    slack.getChannelVisibility(chatChannelId) !== 'workspace'
  ) {
    throw new Error(
      'Reading DMs, private channels, or external conversations is not allowed.'
    );
  }
}

export function joinChannel(slackChannelId: string): Promise<unknown> {
  return slack.webClient
    .apiCall('conversations.join', { channel: slackChannelId })
    .catch(() => undefined);
}
