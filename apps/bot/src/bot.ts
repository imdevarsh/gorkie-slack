import type { Message } from 'chat';
import { runTurn, stopTurn } from '@/lib/agent';
import { isUserAllowed } from '@/lib/allowed-users';
import { bot, slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { toLogError } from '@/lib/utils/error';
import '@/features/assistant';
import '@/features/customizations';

export { bot } from '@/lib/chat';

bot.onNewMention(async (thread, message) => {
  if (await shouldIgnore(message)) {
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
    await thread.subscribe();
  }
  await runTurn({ message, thread });
});

bot.onDirectMessage(async (thread, message) => {
  if (await shouldIgnore(message)) {
    return;
  }
  await thread.subscribe();
  await runTurn({ message, thread });
});

bot.onSubscribedMessage(async (thread, message) => {
  const state = await thread.state;
  const shouldRespondToThread =
    state &&
    typeof state === 'object' &&
    'respondOnThreadMessages' in state &&
    state.respondOnThreadMessages === true;

  if (
    (await shouldIgnore(message)) ||
    !(shouldRespondToThread || message.isMention)
  ) {
    return;
  }
  await runTurn({ message, thread });
});

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

async function shouldIgnore(message: Message): Promise<boolean> {
  if (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  ) {
    return true;
  }
  if (!(await isUserAllowed(message.author.userId))) {
    return true;
  }
  const raw = message.raw;
  const text =
    raw &&
    typeof raw === 'object' &&
    'text' in raw &&
    typeof raw.text === 'string'
      ? raw.text
      : message.text;

  for (const line of text.split('\n')) {
    if (
      line
        .replace(/^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/, '')
        .trimStart()
        .startsWith('##')
    ) {
      return true;
    }
  }
  return false;
}
