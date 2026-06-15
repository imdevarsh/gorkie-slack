export interface RequestHints {
  channel?: string;
  channelId?: string;
  customization?: { prompt: string } | null;
  messageId?: string;
  model?: string;
  server?: string;
  threadId: string;
  time: string;
}
