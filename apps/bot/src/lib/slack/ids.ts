// Chat SDK Slack ids are `slack:CHANNEL` or `slack:CHANNEL:TS`. These convert to
// the raw Slack channel id (C123…) the Web API expects, and back.

export function toRawChannelId(id: string): string {
  return id.startsWith('slack:') ? (id.split(':')[1] ?? id) : id;
}

export function toChatChannelId(channelId: string): string {
  return channelId.startsWith('slack:') ? channelId : `slack:${channelId}`;
}

export function parseSlackThreadId(threadId: string):
  | {
      channelId: string;
      threadTs?: string;
    }
  | undefined {
  const parts = threadId.split(':');
  if (parts[0] !== 'slack' || !parts[1]) {
    return;
  }
  return {
    channelId: `slack:${parts[1]}`,
    threadTs: parts[2],
  };
}
