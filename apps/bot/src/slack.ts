import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '@/env';
import logger from '@/lib/logger';
import { toChatLogger } from '@/lib/logger/chat';

export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: toChatLogger(logger),
});
