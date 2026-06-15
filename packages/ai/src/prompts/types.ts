export interface RequestHints {
  channel?: string;
  customization?: { prompt: string } | null;
  model?: string;
  server?: string;
  time: string;
}
