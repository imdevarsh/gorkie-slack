// Chat SDK Slack ids are `slack:CHANNEL` or `slack:CHANNEL:TS`. These convert to
// the raw Slack channel id (C123…) the Web API expects, and back.

export function toRawSlackChannelId(id: string): string {
  return id.startsWith('slack:') ? (id.split(':')[1] ?? id) : id;
}

export function toChatSlackChannelId(channelId: string): string {
  if (channelId.startsWith('slack:') && channelId.split(':').length === 2) {
    return channelId;
  }
  throw new Error(
    `${channelId} is not a Chat SDK Slack channel id. Use a value like slack:C123456.`
  );
}
