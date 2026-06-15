import { createSlackAdapter } from '@chat-adapter/slack';
import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { runTurn } from '@/agent';
import { env } from '@/env';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';

// Phase 1: the platform layer only — Slack over socket mode, in-memory state.
// No agent yet (that's Phase 2); handlers just confirm the wiring is live.
// State moves to @chat-adapter/state-pg in Phase 3.
export const bot = new Chat({
  userName: 'gorkie',
  adapters: {
    slack: createSlackAdapter({
      mode: 'socket',
      appToken: env.SLACK_APP_TOKEN,
      botToken: env.SLACK_BOT_TOKEN,
    }),
  },
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
