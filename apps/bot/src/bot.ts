import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat, type Message } from 'chat';
import { runTurn } from '@/agent';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';
import { slack } from '@/slack';

// State moves to @chat-adapter/state-pg in Phase 3.
export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  state: createMemoryState(),
  logger: toChatLogger(logger),
});

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
