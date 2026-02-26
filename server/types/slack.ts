import type { SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { SlackFile } from './slack/file';

export type SlackRawMessageEvent = SlackEventMiddlewareArgs<'message'>['event'];

export interface SlackMessageEvent {
  assistant_thread?: { action_token?: string };
  bot_id?: string;
  channel: string;
  channel_type?: string;
  event_ts: string;
  files?: SlackFile[];
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
}

export interface SlackMessageContext {
  botUserId?: string;
  client: WebClient;
  event: SlackMessageEvent;
  teamId?: string;
}
