import { env } from '@/env';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { toRawSlackChannelId } from '@/lib/slack/ids';
import { toLogError } from '@/lib/utils/error';

// Opt-in allowlist: when OPT_IN_CHANNEL is set, only members of that channel may
// use Gorkie. The channel gates terms-of-service acceptance, users read the terms
// posted there and opt in by joining, which is what grants access.

function allowlistKey(channel: string): string {
  return `slack:allowed-users:${channel}`;
}

export async function isUserAllowed(userId: string): Promise<boolean> {
  if (!env.OPT_IN_CHANNEL) {
    return true;
  }
  try {
    const allowedUsers = await bot
      .getState()
      .get<string[]>(allowlistKey(env.OPT_IN_CHANNEL));
    return allowedUsers?.includes(userId) ?? false;
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId },
      '[allowlist] failed to read opt-in cache'
    );
    return false;
  }
}

export async function addAllowedUser(userId: string): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }
  const state = bot.getState();
  try {
    const allowedUsers = new Set(
      (await state.get<string[]>(allowlistKey(channel))) ?? []
    );
    const wasAllowed = allowedUsers.has(userId);
    allowedUsers.add(userId);
    await state.set(allowlistKey(channel), [...allowedUsers]);
    if (!wasAllowed) {
      logger.info({ channel, userId }, '[allowlist] user opted in');
    }
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel, userId },
      '[allowlist] failed to add user to opt-in cache'
    );
  }
}

export async function buildAllowlist(): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }
  const state = bot.getState();

  // No member-left event exists, so leavers stay cached until restart.
  bot.onMemberJoinedChannel(async (event) => {
    if (toRawSlackChannelId(event.channelId) === channel) {
      await addAllowedUser(event.userId);
    }
  });

  try {
    const allowedUsers = new Set<string>();
    let cursor: string | undefined;
    do {
      const response = await slack.webClient.conversations.members({
        channel,
        cursor,
        limit: 200,
      });
      for (const member of response.members ?? []) {
        allowedUsers.add(member);
      }
      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);
    await state.set(allowlistKey(channel), [...allowedUsers]);
    logger.info({ count: allowedUsers.size }, '[allowlist] opt-in cache built');
  } catch (error) {
    logger.error(
      { ...toLogError(error), channel },
      '[allowlist] failed to build opt-in cache'
    );
    throw new Error('Failed to build opt-in allowlist');
  }
}
