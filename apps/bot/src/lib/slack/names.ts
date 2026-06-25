import { z } from 'zod';
import { bot, slack } from '@/lib/chat';
import type { UserProfile } from '@/types/names';

const profileFieldsSchema = z.record(
  z.string(),
  z.looseObject({
    label: z.string().optional(),
    value: z.string().optional(),
  })
);

export async function resolveUserProfile(
  userId: string
): Promise<UserProfile | undefined> {
  const key = `slack:user-profile:${userId}`;
  const [user, cached] = await Promise.all([
    bot.getUser(userId),
    bot.getState().get<UserProfile>(key),
  ]);

  let profile = cached;
  if (!profile) {
    try {
      const { profile: raw } = await slack.webClient.users.profile.get({
        include_labels: true,
        user: userId,
      });
      if (!(raw || user)) {
        return;
      }
      const fields = profileFieldsSchema.parse(raw?.fields ?? {});
      profile = {
        displayName: raw?.display_name || undefined,
        fields: Object.values(fields).flatMap((field) =>
          field.value && field.label
            ? [{ label: field.label, value: field.value }]
            : []
        ),
        pronouns: raw?.pronouns || undefined,
        realName: raw?.real_name || undefined,
        status: raw?.status_text || undefined,
        title: raw?.title || undefined,
      };
      await bot
        .getState()
        .set(key, profile, 86_400_000)
        .catch(() => undefined);
    } catch {
      if (!user) {
        return;
      }
      profile = {};
    }
  }

  return {
    ...profile,
    displayName: user?.userName ?? profile.displayName,
    realName: user?.fullName ?? profile.realName,
  };
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
