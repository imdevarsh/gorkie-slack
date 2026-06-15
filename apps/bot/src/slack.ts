import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '@/env';
import { toChatLogger } from '@/lib/chat-logger';
import logger from '@/lib/logger';

export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: toChatLogger(logger),
});
