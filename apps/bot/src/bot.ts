import type { Message, Thread } from 'chat';
import { compactTurn, runTurn, stopTurn } from '@/lib/agent';
import { isUserAllowed } from '@/lib/allowed-users';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';
import {
  acceptOptIn,
  OPT_IN_ACCEPT_ACTION,
  offerOptIn,
} from '@/lib/onboarding';
import { toLogError } from '@/lib/utils/error';
import '@/features/assistant';
import '@/features/customizations';

export { bot } from '@/lib/chat';

bot.onNewMention(async (thread, message) => {
  if (shouldIgnore(message)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn(thread, message.author);
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
    await thread.subscribe();
  }
  await runCommandOrTurn(thread, message);
});

bot.onDirectMessage(async (thread, message) => {
  if (shouldIgnore(message)) {
    return;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    await offerOptIn(thread, message.author);
    return;
  }
  await thread.subscribe();
  await runCommandOrTurn(thread, message);
});

bot.onSubscribedMessage(async (thread, message) => {
  const state = await thread.state;
  const shouldRespondToThread =
    state &&
    typeof state === 'object' &&
    'respondOnThreadMessages' in state &&
    state.respondOnThreadMessages === true;

  if (
    shouldIgnore(message) ||
    !(shouldRespondToThread || message.isMention) ||
    !(await isUserAllowed(message.author.userId))
  ) {
    return;
  }
  await runCommandOrTurn(thread, message);
});

bot.onAction(OPT_IN_ACCEPT_ACTION, acceptOptIn);

bot.onAction('stop_turn', async (event) => {
  const threadId = event.value ?? event.threadId;
  const stopped = stopTurn({ threadId });

  if (!stopped) {
    await event.thread
      ?.postEphemeral(event.user, 'No active response to stop.', {
        fallbackToDM: false,
      })
      .catch((error: unknown) => {
        logger.warn(
          {
            ...toLogError(error),
            threadId,
            userId: event.user.userId,
          },
          'Failed to post stop feedback'
        );
      });
  }
});

// Leading `<@U...>` mentions Slack puts before the actual message body.
const LEADING_MENTIONS = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/;
const COMPACT_COMMAND = /^!compact\b(.*)$/is;

function rawText(message: Message): string {
  const raw = message.raw;
  return raw &&
    typeof raw === 'object' &&
    'text' in raw &&
    typeof raw.text === 'string'
    ? raw.text
    : message.text;
}

// A `!compact` command addressed to Gorkie returns its (possibly empty) custom
// summary instructions; anything else returns null.
function compactInstructions(message: Message): string | null {
  const body = rawText(message).replace(LEADING_MENTIONS, '').trim();
  const match = body.match(COMPACT_COMMAND);
  return match ? (match[1] ?? '').trim() : null;
}

async function runCommandOrTurn(
  thread: Thread,
  message: Message
): Promise<void> {
  const instructions = compactInstructions(message);
  if (instructions !== null) {
    await compactTurn({
      instructions: instructions || undefined,
      message,
      thread,
    });
    return;
  }
  await runTurn({ message, thread });
}

function shouldIgnore(message: Message): boolean {
  if (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  ) {
    return true;
  }

  for (const line of rawText(message).split('\n')) {
    if (line.replace(LEADING_MENTIONS, '').trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}
