import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat } from 'chat';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';
import { slack } from '@/slack';

// `queue` serializes same-thread messages and answers follow-ups that arrive
// mid-turn instead of dropping them. State moves to @chat-adapter/state-pg in
// Phase 3.
export const bot = new Chat({
  userName: 'gorkie',
  adapters: { slack },
  concurrency: 'queue',
  state: createMemoryState(),
  logger: toChatLogger(logger),
});
