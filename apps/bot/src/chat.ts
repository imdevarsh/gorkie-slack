import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';
import { slack } from '@/slack';

export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  concurrency: 'concurrent',
  state: createMemoryState(),
  logger: toChatLogger(logger),
});
