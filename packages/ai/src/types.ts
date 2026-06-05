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
  allowTraining?: boolean;
  prompt: string;
}

export interface ChatModelOptions {
  allowTraining?: boolean;
  onFallback?: () => void;
}

interface BaseHints {
  channel: string;
  server: string;
  time: string;
}

export interface ChatRequestHints extends BaseHints {
  customization?: UserCustomization;
}

export interface SandboxRequestHints extends BaseHints {}

export interface PromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export type ContextPromptOptions = PromptOptions;
export type SandboxPromptOptions = PromptOptions;
