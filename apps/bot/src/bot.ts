import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
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

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await runTurn({ message, thread });
});

bot.onDirectMessage(async (thread, message) => {
  await thread.subscribe();
  await runTurn({ message, thread });
});

bot.onSubscribedMessage(async (thread, message) => {
  await runTurn({ message, thread });
});
