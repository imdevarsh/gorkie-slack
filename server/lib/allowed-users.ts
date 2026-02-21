import type { App } from '@slack/bolt';
import { env } from '~/env';
import logger from './logger';

const allowedUsers = new Set<string>();

export async function buildCache(app: App) {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }

  // biome-ignore lint/suspicious/useAwait: await is not needed here
  app.event('member_joined_channel', async ({ event }) => {
    if (event.channel !== env.OPT_IN_CHANNEL) {
      return;
    }
    logger.debug(`${event.user} joined opt-in channel`);
    allowedUsers.add(event.user);
    return;
  });

  // biome-ignore lint/suspicious/useAwait: await is not needed here
  app.event('member_left_channel', async ({ event }) => {
    if (event.channel !== env.OPT_IN_CHANNEL) {
      return;
    }
    logger.debug(`${event.user} left opt-in channel`);
    allowedUsers.delete(event.user);
    return;
  });

  let cursor: string | undefined;

  logger.info('Building opt-in user cache');
  do {
    const req = await app.client.conversations.members({
      channel: env.OPT_IN_CHANNEL,
      limit: 200,
      cursor,
    });
    if (!req.ok) {
      throw logger.error({ error: req.error }, 'Error building opt-in cache');
    }
    cursor = req.response_metadata?.next_cursor;
    if (!req.members) {
      continue;
    }
    for (const member of req.members) {
      allowedUsers.add(member);
    }
  } while (cursor);
  logger.info(`${allowedUsers.size} users added to opt-in cache`);
}

export function isUserAllowed(userId: string) {
  if (!env.OPT_IN_CHANNEL) {
    return true;
  }
  return allowedUsers.has(userId);
}
