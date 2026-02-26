import type { SlackMessageContext } from '~/types';
import { contextChannel } from '~/utils/slack-event';

export async function resolveChannelName(
  ctx: SlackMessageContext
): Promise<string> {
  const channelId = contextChannel(ctx);
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

export async function resolveServerName(
  ctx: SlackMessageContext
): Promise<string> {
  try {
    const info = await ctx.client.team.info();
    return info.team?.name ?? 'Slack Workspace';
  } catch {
    return 'Slack Workspace';
  }
}
