export interface SlackSearchResponse {
  error?: string;
  ok: boolean;
  results?: {
    messages: unknown[];
  };
}

export interface SlackHistoryMessage {
  thread_ts?: string;
  ts: string;
}
