import type { SandboxRequestHints, SlackMessageContext } from '~/types';

export interface ContextPromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export interface SandboxPromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}
