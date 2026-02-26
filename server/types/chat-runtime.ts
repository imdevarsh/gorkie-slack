import type { SlackAdapter } from '@chat-adapter/slack';
import type { WebClient } from '@slack/web-api';
import type { Chat, Message, Thread } from 'chat';
import type { SlackFile } from '~/utils/images';

export interface ChatRuntimeEvent {
  channel: string;
  channel_type?: string;
  event_ts: string;
  files?: SlackFile[];
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
}

export interface ChatRuntimeContext {
  botUserId?: string;
  channelId: string;
  chat: Chat;
  client: WebClient;
  event: ChatRuntimeEvent;
  message: Message;
  slack: SlackAdapter;
  teamId?: string;
  thread: Thread;
  threadId: string;
  userId?: string;
}
