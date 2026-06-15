import { createPostgresState } from '@chat-adapter/state-pg';
import { Chat } from 'chat';
import { env } from '@/env';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';
import { slack } from '@/slack';

export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  concurrency: 'concurrent',
  state: createPostgresState({ url: env.DATABASE_URL }),
  logger: toChatLogger(logger),
});
