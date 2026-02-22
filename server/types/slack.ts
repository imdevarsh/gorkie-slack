import type { SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';

export type SlackMessageEvent = SlackEventMiddlewareArgs<'message'>['event'];

export interface SlackMessageContext {
  botUserId?: string;
  client: WebClient;
  event: SlackMessageEvent;
  teamId?: string;
}
