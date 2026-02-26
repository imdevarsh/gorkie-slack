import type { WebClient } from '@slack/web-api';
import type { SlackFile } from './file';

export interface ConversationOptions {
  botUserId?: string;
  channel: string;
  client: WebClient;
  inclusive?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
  threadTs?: string;
}

export interface SlackConversationMessage {
  bot_id?: string;
  files?: SlackFile[];
  subtype?: string;
  text?: string;
  ts?: string;
  user?: string;
}
