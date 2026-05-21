export interface SlackFile {
  mimetype?: string;
  name?: string;
}

export interface SlackMessageEvent {
  channel: string;
  files?: SlackFile[];
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
}

export interface SlackMessageContext {
  botUserId?: string;
  event: SlackMessageEvent;
  teamId?: string;
}

export interface UserCustomization {
  prompt: string | null;
}

interface BaseHints {
  channel: string;
  server: string;
  time: string;
}

export interface ChatRequestHints extends BaseHints {
  activity: string;
  customization?: UserCustomization;
  joined: number;
  status: string;
}

export interface SandboxRequestHints extends BaseHints {}

export interface PromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export type ContextPromptOptions = PromptOptions;
export type SandboxPromptOptions = PromptOptions;
