import type { Message } from 'chat';
import { runTurn } from '@/agent';
import { bot } from '@/chat';

export { bot } from '@/chat';

const IGNORE_PREFIX = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)*##/;

function shouldRespond(message: Message): boolean {
  if (message.author.isBot === true || message.author.isMe) {
    return false;
  }
  if (IGNORE_PREFIX.test(message.text)) {
    return false;
  }
  if (
    message.raw &&
    typeof message.raw === 'object' &&
    'text' in message.raw &&
    typeof message.raw.text === 'string'
  ) {
    return !IGNORE_PREFIX.test(message.raw.text);
  }
  return true;
}

bot.onNewMention(async (thread, message) => {
  if (!shouldRespond(message)) {
    return;
  }
  await thread.subscribe();
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
  if (!shouldRespond(message)) {
    return;
  }
  await runTurn({ message, thread });
});
