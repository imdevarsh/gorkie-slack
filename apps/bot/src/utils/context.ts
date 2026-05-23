import { getUserCustomization } from '@repo/db/queries';
import { getTime } from '@repo/utils/time';
import type { ModelMessage } from 'ai';
import { getConversationMessages } from '@/slack/conversations';
import type { ChatRequestHints, SlackMessageContext } from '@/types';
import { resolveChannelName, resolveServerName } from '@/utils/slack';

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

type BotDetails = { joined: number; status: string; activity: string };
const botCache = new Map<string, BotDetails>();
const botInflight = new Map<string, Promise<BotDetails>>();

function fetchBotDetails(
  ctx: SlackMessageContext,
  botId: string
): Promise<BotDetails> {
  const promise = ctx.client.users
    .info({ user: botId })
    .then((info) => {
      const joinedSeconds =
        (info.user as { updated?: number; created?: number } | undefined)
          ?.created ??
        info.user?.updated ??
        Math.floor(Date.now() / 1000);
      const status =
        info.user?.profile?.status_text?.trim() ||
        info.user?.profile?.status_emoji?.trim() ||
        'active';
      const details: BotDetails = {
        joined: joinedSeconds * 1000,
        status,
        activity: info.user?.profile?.status_text?.trim() || 'none',
      };
      botCache.set(botId, details);
      return details;
    })
    .catch(
      (): BotDetails => ({
        joined: Date.now(),
        status: 'active',
        activity: 'none',
      })
    )
    .finally(() => {
      botInflight.delete(botId);
    });

  botInflight.set(botId, promise);
  return promise;
}

async function resolveBotDetails(
  ctx: SlackMessageContext
): Promise<BotDetails> {
  const botId = ctx.botUserId;
  if (!botId) {
    return { joined: Date.now(), status: 'active', activity: 'none' };
  }
  return (
    botCache.get(botId) ?? botInflight.get(botId) ?? fetchBotDetails(ctx, botId)
  );
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
    const userId = ctx.event.user;
    const [channelName, serverName, botDetails, customization] =
      await Promise.all([
        resolveChannelName(ctx),
        resolveServerName(ctx),
        resolveBotDetails(ctx),
        userId
          ? getUserCustomization(userId).catch(() => null)
          : Promise.resolve(null),
      ]);

    requestHints = {
      channel: channelName,
      time: getTime(),
      server: serverName,
      joined: botDetails.joined,
      status: botDetails.status,
      activity: botDetails.activity,
      customization: customization ?? undefined,
    };
  }

  return { messages, requestHints };
}
