import type { WebClient } from '@slack/web-api';
import { env } from '~/env';
import { toLogError } from '~/utils/error';
import logger from './logger';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const allowedUsers = new Set<string>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAllowedUsers(client: WebClient): Promise<void> {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }

  const nextAllowedUsers = new Set<string>();
  let cursor: string | undefined;

  do {
    const req = await client.conversations.members({
      channel: env.OPT_IN_CHANNEL,
      limit: 200,
      cursor,
    });

    if (!req.ok) {
      logger.error(
        { ...toLogError(req.error), channelId: env.OPT_IN_CHANNEL },
        'Error refreshing opt-in cache'
      );
      throw new Error('Failed to refresh opt-in cache');
    }

    cursor = req.response_metadata?.next_cursor;
    for (const member of req.members ?? []) {
      nextAllowedUsers.add(member);
    }
  } while (cursor);

  allowedUsers.clear();
  for (const user of nextAllowedUsers) {
    allowedUsers.add(user);
  }

  logger.info(
    { count: allowedUsers.size, channelId: env.OPT_IN_CHANNEL },
    'Refreshed opt-in user cache'
  );
}

export async function startAllowedUsersSync(client: WebClient): Promise<void> {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }

  logger.info('Starting opt-in user cache sync');
  await refreshAllowedUsers(client);

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    refreshAllowedUsers(client).catch((error: unknown) => {
      logger.error(
        { ...toLogError(error) },
        'Failed periodic opt-in cache sync'
      );
    });
  }, REFRESH_INTERVAL_MS);
}

export function stopAllowedUsersSync(): void {
  if (!refreshTimer) {
    return;
  }

  clearInterval(refreshTimer);
  refreshTimer = null;
}

export function isUserAllowed(userId: string): boolean {
  if (!env.OPT_IN_CHANNEL) {
    return true;
  }

  return allowedUsers.has(userId);
}
