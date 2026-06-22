import { slack } from '@/lib/chat';

const channelNames = new Map<string, string>();
const userNames = new Map<string, string>();
let serverName: string | undefined;

export async function resolveUserName(
  userId: string
): Promise<string | undefined> {
  const cached = userNames.get(userId);
  if (cached) {
    return cached;
  }
  try {
    const info = await slack.webClient.users.info({ user: userId });
    const profile = info.user?.profile;
    const name = profile?.display_name || profile?.real_name || info.user?.name;
    if (name) {
      userNames.set(userId, name);
    }
    return name;
  } catch {
    return;
  }
}

export async function resolveChannelName(
  channelId: string
): Promise<string | undefined> {
  const cached = channelNames.get(channelId);
  if (cached) {
    return cached;
  }
  try {
    const info = await slack.webClient.conversations.info({
      channel: channelId,
    });
    const name = info.channel?.name;
    if (name) {
      channelNames.set(channelId, name);
    }
    return name;
  } catch {
    return;
  }
}

export async function resolveWorkspaceName(): Promise<string | undefined> {
  if (serverName) {
    return serverName;
  }
  try {
    const info = await slack.webClient.team.info();
    serverName = info.team?.name;
    return serverName;
  } catch {
    return;
  }
}
