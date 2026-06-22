export interface RequestHints {
  channel?: {
    id?: string;
    name?: string;
  };
  customization?: { prompt: string } | null;
  messageId?: string;
  threadId: string;
  time: string;
  workspace?: string;
}
