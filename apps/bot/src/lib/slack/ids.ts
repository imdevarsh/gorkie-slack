// Chat SDK Slack ids are `slack:CHANNEL` or `slack:CHANNEL:TS`. These convert to
// the raw Slack channel id (C123…) the Web API expects, and back.

export function toRawChannelId(id: string): string {
  return id.startsWith('slack:') ? (id.split(':')[1] ?? id) : id;
}

export function toChatChannelId(channelId: string): string {
  return channelId.startsWith('slack:') ? channelId : `slack:${channelId}`;
}
