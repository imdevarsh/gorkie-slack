import { toLogError } from '@repo/utils/error';
import { env } from '@/env';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';

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

  // The Slack adapter has no member-left event, so leavers stay cached until the
  // next restart, an acceptable over-permission for an opt-in gate.
  bot.onMemberJoinedChannel((event) => {
    // event.channelId is the chat-encoded id (`slack:C123:`), so compare on the
    // raw Slack channel id, not the encoded string.
    if (event.channelId.split(':')[1] === channel) {
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
