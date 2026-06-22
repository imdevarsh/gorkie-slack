import { env } from '@/env';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { toRawChannelId } from '@/lib/slack/ids';
import { toLogError } from '@/lib/utils/error';

// Opt-in allowlist: when OPT_IN_CHANNEL is set, only members of that channel may
// use Gorkie. The channel gates terms-of-service acceptance, users read the terms
// posted there and opt in by joining, which is what grants access. The set is kept
// in memory and synced from the channel. No OPT_IN_CHANNEL means open to everyone.
const allowedUsers = new Set<string>();

export function isUserAllowed(userId: string): boolean {
  if (!env.OPT_IN_CHANNEL) {
    return true;
  }
  return allowedUsers.has(userId);
}

export async function buildAllowlist(): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }

  // No member-left event exists, so leavers stay cached until restart.
  bot.onMemberJoinedChannel((event) => {
    if (toRawChannelId(event.channelId) === channel) {
      allowedUsers.add(event.userId);
    }
  });

  try {
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
    logger.info({ count: allowedUsers.size }, '[allowlist] opt-in cache built');
  } catch (error) {
    logger.error(
      { ...toLogError(error), channel },
      '[allowlist] failed to build opt-in cache'
    );
    throw new Error('Failed to build opt-in allowlist');
  }
}
