import { toLogError } from '@repo/utils/error';
import type { WebClient } from '@slack/web-api';
import logger from '@/lib/logger';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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

  const existing = inflight.get(userId);
  if (existing) {
    return existing;
  }

  const promise = client.users
    .info({ user: userId })
    .then((info) => {
      const name =
        info.user?.profile?.display_name ||
        info.user?.real_name ||
        info.user?.name ||
        userId;
      cache.set(userId, name);
      return name;
    })
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to fetch Slack user info'
      );
      cache.set(userId, userId);
      return userId;
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, promise);
  return promise;
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
