import type { Message } from 'chat';
import { runTurn, STOP_TURN_ACTION, stopTurn } from '@/agent';
import { bot, slack } from '@/lib/chat';
import '@/slack/features/assistant';
import '@/slack/features/customizations';

export { bot } from '@/lib/chat';

const IGNORE_PREFIX = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)*##/;
const SLACK_MENTION = /<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>/;
const RESPOND_ON_THREAD_MESSAGES = 'respondOnThreadMessages';

function rawText(message: Message): string | null {
  if (
    message.raw &&
    typeof message.raw === 'object' &&
    'text' in message.raw &&
    typeof message.raw.text === 'string'
  ) {
    return message.raw.text;
  }

  return null;
}

function rawString(message: Message, key: string): string | null {
  if (
    message.raw &&
    typeof message.raw === 'object' &&
    key in message.raw &&
    typeof message.raw[key as keyof typeof message.raw] === 'string'
  ) {
    return message.raw[key as keyof typeof message.raw];
  }

  return null;
}

function isThreadRootMessage(message: Message): boolean {
  const threadTs = rawString(message, 'thread_ts');
  const ts = rawString(message, 'ts');
  return !threadTs || threadTs === ts;
}

function mentionsBot(message: Message): boolean {
  const text = rawText(message) ?? message.text;
  const botUserId = slack.botUserId;

  if (!botUserId) {
    return SLACK_MENTION.test(text);
  }

  const mention = new RegExp(`<@${botUserId}(?:\\|[^>]+)?>`);
  return mention.test(text);
}

function shouldRespond(message: Message): boolean {
  if (message.author.isBot === true || message.author.isMe) {
    return false;
  }
  if (IGNORE_PREFIX.test(message.text)) {
    return false;
  }
  const raw = rawText(message);
  if (raw) {
    return !IGNORE_PREFIX.test(raw);
  }
  return true;
}

bot.onNewMention(async (thread, message) => {
  if (!shouldRespond(message)) {
    return;
  }
  if (isThreadRootMessage(message)) {
    await thread.setState({ [RESPOND_ON_THREAD_MESSAGES]: true });
    await thread.subscribe();
  }
  await runTurn({ message, thread });
});

bot.onDirectMessage(async (thread, message) => {
  if (!shouldRespond(message)) {
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
    RESPOND_ON_THREAD_MESSAGES in state &&
    state[RESPOND_ON_THREAD_MESSAGES] === true;

  if (
    !(shouldRespond(message) && (shouldRespondToThread || mentionsBot(message)))
  ) {
    return;
  }
  await runTurn({ message, thread });
});

bot.onAction(STOP_TURN_ACTION, async (event) => {
  const threadId = event.value ?? event.threadId;
  const stopped = stopTurn({ threadId });

  if (!stopped) {
    await event.thread
      ?.postEphemeral(event.user, 'No active response to stop.', {
        fallbackToDM: false,
      })
      .catch(() => undefined);
  }
});
