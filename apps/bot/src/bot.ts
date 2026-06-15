import { createSlackAdapter } from '@chat-adapter/slack';
import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { runTurn } from '@/agent';
import { env } from '@/env';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';

// State moves to @chat-adapter/state-pg in Phase 3.
const chatLogger = toChatLogger(logger);

export const bot = new Chat({
  userName: 'gorkie',
  adapters: {
    slack: createSlackAdapter({
      mode: 'socket',
      appToken: env.SLACK_APP_TOKEN,
      botToken: env.SLACK_BOT_TOKEN,
      logger: chatLogger,
    }),
  },
  state: createMemoryState(),
  logger: chatLogger,
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
