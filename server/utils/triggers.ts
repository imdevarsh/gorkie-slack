import type {
  SlackMessageContext,
  SlackMessageEvent,
  TriggerType,
} from '~/types';
import {
  eventChannel,
  eventChannelType,
  eventThreadTs,
  eventUserId,
  eventText,
} from '~/utils/slack-event';
import { primeSlackUserName } from '~/utils/users';

function isPlainMessage(
  event: SlackMessageEvent
): event is SlackMessageEvent & { text: string; user: string } {
  const subtype = 'subtype' in event ? event.subtype : undefined;
  const text = eventText(event);
  const userId = eventUserId(event);
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

  const channelType = eventChannelType(event);
  if (channelType === 'im') {
    return { type: 'dm', info: event.user };
  }

  const channelId = eventChannel(message.event);
  const threadTs = eventThreadTs(message.event);
  if (
    channelId &&
    threadTs &&
    (!message.event.subtype ||
      message.event.subtype === 'thread_broadcast' ||
      message.event.subtype === 'file_share') &&
    (
      await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 1,
      })
    )?.messages?.[0]?.text?.includes(`<@${botId}>`)
  ) {
    return { type: 'thread', info: event.user };
  }

  return { type: null, info: null };
}
