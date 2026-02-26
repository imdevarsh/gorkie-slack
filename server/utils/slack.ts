import type { ChatRuntimeContext } from '~/types';

export async function resolveChannelName(
  ctx: ChatRuntimeContext
): Promise<string> {
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

export async function resolveServerName(
  ctx: ChatRuntimeContext
): Promise<string> {
  try {
    const info = await ctx.client.team.info();
    return info.team?.name ?? 'Slack Workspace';
  } catch {
    return 'Slack Workspace';
  }
}
