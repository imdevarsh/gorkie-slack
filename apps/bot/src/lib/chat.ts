import { createSlackAdapter } from '@chat-adapter/slack';
import { createPostgresState } from '@chat-adapter/state-pg';
import { Chat } from 'chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { toChatLogger } from '@/lib/logger/chat';

export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: toChatLogger(logger),
});

export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  concurrency: 'concurrent',
  state: createPostgresState({ url: env.DATABASE_URL }),
  logger: toChatLogger(logger),
});
