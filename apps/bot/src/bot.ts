import type { Message } from 'chat';
import { runTurn } from '@/agent';
import { bot } from '@/chat';

export { bot } from '@/chat';

// Ignore other bots and our own posts; `##` is the user opt-out prefix.
function shouldRespond(message: Message): boolean {
  if (message.author.isBot === true || message.author.isMe) {
    return false;
  }
  return !message.text.trimStart().startsWith('##');
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
