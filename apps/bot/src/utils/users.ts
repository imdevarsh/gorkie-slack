import { toLogError } from '@repo/utils/error';
import type { WebClient } from '@slack/web-api';
import logger from '@/lib/logger';

const cache = new Map<string, string>();

export async function getSlackUserName(
  client: WebClient,
  userId: string
): Promise<string> {
  if (!userId) {
    return 'unknown';
  }

  const cached = cache.get(userId);
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
    cache.set(userId, name);
    return name;
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      'Failed to fetch Slack user info'
    );
    cache.set(userId, userId);
    return userId;
  }
}

export function primeSlackUserName(userId: string, name: string) {
  if (!userId) {
    return;
  }
  cache.set(userId, name);
}

export function normalizeSlackUserId(raw: string): string {
  return raw.replace(/[<@>]/g, '').trim();
}
