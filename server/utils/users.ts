import type { WebClient } from '@slack/web-api';
import logger from '~/lib/logger';

const userNameCache = new Map<string, string>();

export async function getSlackUserName(
  client: WebClient,
  userId: string
): Promise<string> {
  if (!userId) {
    return 'unknown';
  }

  const cached = userNameCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const info = await client.users.info({ user: userId });
    const name =
      info.user?.profile?.display_name ||
      info.user?.real_name ||
      info.user?.name ||
      userId;
    userNameCache.set(userId, name);
    return name;
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to fetch Slack user info');
    userNameCache.set(userId, userId);
    return userId;
  }
}

export function primeSlackUserName(userId: string, name: string) {
  if (!userId) {
    return;
  }
  userNameCache.set(userId, name);
}

export function normalizeSlackUserId(raw: string): string {
  return raw.replace(/[<@>]/g, '').trim();
}
