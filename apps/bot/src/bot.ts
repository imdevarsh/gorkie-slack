import { createSlackAdapter } from '@chat-adapter/slack';
import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { env } from '@/env';

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
  logger: env.LOG_LEVEL,
});

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post(
    'gorkie here — platform layer is live. The agent lands in Phase 2.'
  );
});

bot.onDirectMessage(async (thread) => {
  await thread.subscribe();
  await thread.post('gorkie here (DM) — platform layer is live.');
});

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`echo: ${message.text}`);
});
