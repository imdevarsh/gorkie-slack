import type { ModelMessage } from '@repo/ai';
import { getUserCustomization } from '@repo/db/queries';
import { getTime } from '@repo/utils/time';
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
    const [channelName, serverName, customization] = await Promise.all([
      resolveChannelName(ctx),
      resolveServerName(ctx),
      userId
        ? getUserCustomization(userId).catch(() => null)
        : Promise.resolve(null),
    ]);

    requestHints = {
      channel: channelName,
      time: getTime(),
      server: serverName,
      customization: customization ?? undefined,
    };
  }

  return { messages, requestHints };
}
