export interface RequestHints {
  channel?: {
    id?: string;
    name?: string;
  };
  customization?: { prompt: string } | null;
  messageId?: string;
  server?: string;
  threadId: string;
  time: string;
}
