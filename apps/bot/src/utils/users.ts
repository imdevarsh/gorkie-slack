import { toLogError } from '@repo/utils/error';
import type { WebClient } from '@slack/web-api';
import logger from '@/lib/logger';

export type SlackUser = {
  id: string;
  name: string;
  displayName: string | null;
  realName: string | null;
  title: string | null;
  isBot: boolean;
  tz: string | null;
};

const cache = new Map<string, SlackUser>();
const inFlight = new Map<string, Promise<SlackUser>>();

export async function getSlackUser(
  client: WebClient,
  userId: string
): Promise<SlackUser> {
  const fallback: SlackUser = {
    id: userId,
    name: userId,
    displayName: null,
    realName: null,
    title: null,
    isBot: false,
    tz: null,
  };

  if (!userId) {
    return fallback;
  }

  const cached = cache.get(userId);
  if (cached) {
    return cached;
  }

  const existing = inFlight.get(userId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const info = await client.users.info({ user: userId });
      const user = info.user;
      const result: SlackUser = {
        id: userId,
        name:
          user?.profile?.display_name ||
          user?.real_name ||
          user?.name ||
          userId,
        displayName: user?.profile?.display_name ?? null,
        realName: user?.profile?.real_name ?? null,
        title: user?.profile?.title ?? null,
        isBot: user?.is_bot ?? false,
        tz: user?.tz ?? null,
      };
      cache.set(userId, result);
      return result;
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId },
        'Failed to fetch Slack user info'
      );
      cache.set(userId, fallback);
      return fallback;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export function primeSlackUser(
  userId: string,
  partial: Partial<Omit<SlackUser, 'id'>> & { name: string }
) {
  if (!userId) {
    return;
  }
  cache.set(userId, {
    id: userId,
    displayName: null,
    realName: null,
    title: null,
    isBot: false,
    tz: null,
    ...partial,
  });
}

export function normalizeSlackUserId(raw: string): string {
  return raw.replace(/[<@>]/g, '').trim();
}
