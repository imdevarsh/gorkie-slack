import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { ChatRequestHints, SlackMessageContext } from '~/types';
import { resolveChannelName, resolveServerName } from '~/utils/slack';
import { getTime } from '~/utils/time';

export function getContextId(context: SlackMessageContext): string {
  const channel = context.event.channel ?? 'unknown-channel';
  const channelType = context.event.channel_type;
  const userId = context.event.user;
  const threadTs = context.event.thread_ts ?? context.event.ts;

  if (channelType === 'im' && userId) {
    return `dm:${userId}`;
  }
  return `${channel}:${threadTs}`;
}

async function resolveBotDetails(
  ctx: SlackMessageContext
): Promise<{ joined: number; status: string; activity: string }> {
  const botId = ctx.botUserId;
  if (!botId) {
    return { joined: Date.now(), status: 'active', activity: 'none' };
  }

  try {
    const info = await ctx.client.users.info({ user: botId });
    const joinedSeconds =
      (info.user as { updated?: number; created?: number } | undefined)
        ?.created ??
      info.user?.updated ??
      Math.floor(Date.now() / 1000);
    const status =
      info.user?.profile?.status_text?.trim() ||
      info.user?.profile?.status_emoji?.trim() ||
      'active';
    return {
      joined: joinedSeconds * 1000,
      status,
      activity: info.user?.profile?.status_text?.trim() || 'none',
    };
  } catch {
    return { joined: Date.now(), status: 'active', activity: 'none' };
  }
}

export async function buildChatContext(
  ctx: SlackMessageContext,
  opts?: {
    messages?: ModelMessage[];
    requestHints?: ChatRequestHints;
  }
): Promise<{ messages: ModelMessage[]; requestHints: ChatRequestHints }> {
  let messages = opts?.messages;
  let requestHints = opts?.requestHints;

  const channelId = ctx.event.channel;
  const threadTs = ctx.event.thread_ts;
  const messageTs = ctx.event.ts;

  if (!(channelId && messageTs)) {
    throw new Error('Slack message missing channel or timestamp');
  }

  if (!messages) {
    messages = await getConversationMessages({
      client: ctx.client,
      channel: channelId,
      threadTs,
      botUserId: ctx.botUserId,
      limit: 50,
      latest: messageTs,
      inclusive: false,
    });
  }

  if (!requestHints) {
    const [channelName, serverName, botDetails] = await Promise.all([
      resolveChannelName(ctx),
      resolveServerName(ctx),
      resolveBotDetails(ctx),
    ]);

    requestHints = {
      channel: channelName,
      time: getTime(),
      server: serverName,
      joined: botDetails.joined,
      status: botDetails.status,
      activity: botDetails.activity,
    };
  }

  return { messages, requestHints };
}
