import type {
  SlackMessageContext,
  SlackMessageEvent,
  TriggerType,
} from '~/types';
import { primeSlackUserName } from '~/utils/users';

function isPlainMessage(
  event: SlackMessageEvent
): event is SlackMessageEvent & { text: string; user: string } {
  const subtype = 'subtype' in event ? event.subtype : undefined;
  return (
    (!subtype || subtype === 'thread_broadcast' || subtype === 'file_share') &&
    'text' in event &&
    typeof (event as { text?: unknown }).text === 'string' &&
    'user' in event &&
    typeof (event as { user?: unknown }).user === 'string'
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
    try {
      const info = await client.users.info({ user: botId });
      const displayName =
        info.user?.profile?.display_name || info.user?.name || null;
      if (displayName) {
        primeSlackUserName(botId, displayName);
      }
      return { type: 'ping', info: displayName ?? botId };
    } catch {
      return { type: 'ping', info: botId };
    }
  }

  const channelType = (event as { channel_type?: string }).channel_type;
  if (channelType === 'im') {
    return { type: 'dm', info: event.user };
  }

  if (
    (!message.event.subtype ||
      message.event.subtype === 'thread_broadcast' ||
      message.event.subtype === 'file_share') &&
    message.event.thread_ts &&
    (
      await client.conversations.replies({
        channel: message.event.channel,
        ts: message.event.thread_ts,
        limit: 1,
      })
    )?.messages?.[0]?.text?.includes(`<@${botId}>`)
  ) {
    return { type: 'thread', info: event.user };
  }

  return { type: null, info: null };
}
