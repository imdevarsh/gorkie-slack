import type { Message, Thread } from 'chat';
import { runTurn, stopTurn } from '@/lib/agent';
import { isUserAllowed } from '@/lib/allowed-users';
import { bot, slack } from '@/lib/chat';
import { handleCommand } from '@/lib/commands';
import logger from '@/lib/logger';
import { acceptOptIn, offerOptIn } from '@/lib/onboarding';
import { toLogError } from '@/lib/utils/error';
import { rawText, withoutLeadingMentions } from '@/lib/utils/message';
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

bot.onAction('opt_in_accept', acceptOptIn);

bot.onAction('stop_turn', async (event) => {
  const threadId = event.value ?? event.threadId;
  const stopped = stopTurn({ threadId });

  if (!stopped) {
    await event.thread
      ?.postEphemeral(event.user, 'no active response to stop.', {
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

async function runCommandOrTurn(
  thread: Thread,
  message: Message
): Promise<void> {
  if (await handleCommand({ message, thread })) {
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
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}
