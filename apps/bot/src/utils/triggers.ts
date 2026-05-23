import type {
  SlackMessageContext,
  SlackMessageEvent,
  TriggerType,
} from '@/types';
import { getSlackUserName } from '@/utils/users';

function isPlainMessage(
  event: SlackMessageEvent
): event is SlackMessageEvent & { text: string; user: string } {
  const subtype = event.subtype;
  const text = event.text;
  const userId = event.user;
  return (
    (!subtype || subtype === 'thread_broadcast' || subtype === 'file_share') &&
    typeof text === 'string' &&
    typeof userId === 'string'
  );
}

export async function getTrigger(
  message: SlackMessageContext,
  botId?: string
): Promise<{ type: TriggerType; info: string | string[] | null }> {
  const { event, client } = message;

  if (!isPlainMessage(event)) {
    return { type: null, info: null };
  }

  const content = event.text.trim();

  if (botId && content.includes(`<@${botId}>`)) {
    const displayName = await getSlackUserName(client, botId);
    return { type: 'ping', info: displayName };
  }

  const channelType = event.channel_type;
  if (channelType === 'im') {
    return { type: 'dm', info: event.user };
  }

  const channelId = message.event.channel;
  const threadTs = message.event.thread_ts;
  if (
    botId &&
    channelId &&
    threadTs &&
    (!message.event.subtype ||
      message.event.subtype === 'thread_broadcast' ||
      message.event.subtype === 'file_share')
  ) {
    try {
      const replies = await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 1,
      });
      if (replies.messages?.[0]?.text?.includes(`<@${botId}>`)) {
        return { type: 'thread', info: event.user };
      }
    } catch {
      return { type: null, info: null };
    }
  }

  return { type: null, info: null };
}
