import { createPostgresState } from '@chat-adapter/state-pg';
import { Chat } from 'chat';
import { env } from '@/env';
import logger from '@/lib/logger';
import { toChatLogger } from '@/lib/logger/chat';
import { slack } from '@/slack';

export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  concurrency: 'concurrent',
  state: createPostgresState({ url: env.DATABASE_URL }),
  logger: toChatLogger(logger),
});
