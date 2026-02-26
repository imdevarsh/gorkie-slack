import type { SlackFile } from './file';

export interface AssistantThreadEvent {
  assistant_thread?: { action_token?: string };
}

export interface SlackSearchResponse {
  error?: string;
  ok: boolean;
  results?: {
    messages: unknown[];
  };
}

export interface SlackHistoryMessage {
  thread_ts?: string;
  ts?: string;
}

export interface SlackFileShareMessage {
  files?: SlackFile[];
  subtype?: string;
  text?: string;
  ts?: string;
  user?: string;
}
