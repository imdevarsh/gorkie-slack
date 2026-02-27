import type { SandboxRequestHints, SlackMessageContext } from '~/types';

export interface PromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export type ContextPromptOptions = PromptOptions;
export type SandboxPromptOptions = PromptOptions;
