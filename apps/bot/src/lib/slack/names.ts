import { bot, slack } from '@/lib/chat';

export interface UserProfile {
  displayName?: string;
  pronouns?: string;
  realName?: string;
  title?: string;
}

export async function resolveUserProfile(
  userId: string
): Promise<UserProfile | undefined> {
  const [user, cachedProfile] = await Promise.all([
    bot.getUser(userId),
    bot
      .getState()
      .get<{ pronouns?: string; title?: string }>(
        `slack:user-profile:${userId}`
      ),
  ]);
  if (user && cachedProfile) {
    return {
      displayName: user.userName,
      pronouns: cachedProfile.pronouns,
      realName: user.fullName,
      title: cachedProfile.title,
    };
  }
  try {
    const info = await slack.webClient.users.info({ user: userId });
    const profile = info.user?.profile;
    if (!(profile || user)) {
      return;
    }
    const profileCache = {
      pronouns: profile?.pronouns || undefined,
      title: profile?.title || undefined,
    };
    await bot
      .getState()
      .set(`slack:user-profile:${userId}`, profileCache, 86_400_000)
      .catch(() => undefined);
    const resolved: UserProfile = {
      displayName:
        user?.userName || profile?.display_name || info.user?.name || undefined,
      pronouns: profileCache.pronouns,
      realName: user?.fullName || profile?.real_name || undefined,
      title: profileCache.title,
    };
    return resolved;
  } catch {
    if (user) {
      return {
        displayName: user.userName,
        realName: user.fullName,
      };
    }
  }
}

export async function resolveChannelName(
  channelId: string
): Promise<string | undefined> {
  const state = bot.getState();
  const cached = await state.get<{ name?: string }>(
    `slack:channel:${channelId}`
  );
  if (cached?.name) {
    return cached.name;
  }
  try {
    const info = await slack.webClient.conversations.info({
      channel: channelId,
    });
    const name = info.channel?.name;
    if (name) {
      await state
        .set(`slack:channel:${channelId}`, { name }, 86_400_000)
        .catch(() => undefined);
    }
    return name;
  } catch {
    return;
  }
}

export async function resolveWorkspaceName(): Promise<string | undefined> {
  const state = bot.getState();
  const cached = await state.get<{ name?: string }>('slack:workspace');
  if (cached?.name) {
    return cached.name;
  }
  try {
    const info = await slack.webClient.team.info();
    const name = info.team?.name;
    if (name) {
      await state
        .set('slack:workspace', { name }, 86_400_000)
        .catch(() => undefined);
    }
    return name;
  } catch {
    return;
  }
}
