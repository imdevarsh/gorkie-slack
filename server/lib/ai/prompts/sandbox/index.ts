import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { workflowPrompt } from './workflow';

interface SandboxPromptOptions {
  context?: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export function sandboxPrompt({
  context,
  requestHints,
}: SandboxPromptOptions = {}): string {
  return [
    corePrompt,
    environmentPrompt,
    contextPrompt({ context, requestHints }),
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
