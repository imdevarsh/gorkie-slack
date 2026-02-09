import type { ModelMessage } from 'ai';
import { getConversationMessages } from '~/slack/conversations';
import type { RequestHints, SlackMessageContext } from '~/types';
import { getTime } from '~/utils/time';

export function getContextId(context: SlackMessageContext): string {
  const channel = context.event.channel ?? 'unknown-channel';
  const channelType = context.event.channel_type;
  const userId = (context.event as { user?: string }).user;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  if (channelType === 'im' && userId) {
    return `dm:${userId}`;
  }
  if (threadTs) {
    return `${channel}:${threadTs}`;
  }
  return channel;
}

/**
 * Thread-aware context ID for sandbox persistence.
 *
 * Unlike getContextId (which returns just the channel for non-threaded
 * messages), this always includes the message timestamp so the sandbox
 * key is the same for the initial channel message and its thread replies.
 *
 *   Initial message  (ts=X, no thread_ts) → channel:X
 *   Thread reply     (thread_ts=X)        → channel:X
 */
export function getSandboxContextId(context: SlackMessageContext): string {
  const channel = context.event.channel ?? 'unknown-channel';
  const channelType = context.event.channel_type;
  const userId = (context.event as { user?: string }).user;
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;

  if (channelType === 'im' && userId) {
    return `dm:${userId}`;
  }
  return `${channel}:${threadTs}`;
}

async function resolveChannelName(ctx: SlackMessageContext): Promise<string> {
  const channelId = (ctx.event as { channel?: string }).channel;
  if (!channelId) {
    return 'Unknown channel';
  }

  try {
    const info = await ctx.client.conversations.info({ channel: channelId });
    const channel = info.channel;
    if (!channel) {
      return channelId;
    }
    if (channel.is_im) {
      return 'Direct Message';
    }
    return channel.name_normalized ?? channel.name ?? channelId;
  } catch {
    return channelId;
  }
}

async function resolveServerName(ctx: SlackMessageContext): Promise<string> {
  try {
    const info = await ctx.client.team.info();
    return info.team?.name ?? 'Slack Workspace';
  } catch {
    return 'Slack Workspace';
  }
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
    hints?: RequestHints;
  }
) {
  let messages = opts?.messages;
  let hints = opts?.hints;

  const channelId = (ctx.event as { channel?: string }).channel;
  const threadTs = (ctx.event as { thread_ts?: string }).thread_ts;
  const messageTs = ctx.event.ts;
  const _text = (ctx.event as { text?: string }).text ?? '';
  const _userId = (ctx.event as { user?: string }).user;

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

  if (!hints) {
    const [channelName, serverName, botDetails] = await Promise.all([
      resolveChannelName(ctx),
      resolveServerName(ctx),
      resolveBotDetails(ctx),
    ]);

    hints = {
      channel: channelName,
      time: getTime(),
      server: serverName,
      joined: botDetails.joined,
      status: botDetails.status,
      activity: botDetails.activity,
    };
  }

  return { messages, hints };
}
