import type { ChatRuntimeContext, SandboxRequestHints } from '~/types';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { workflowPrompt } from './workflow';

interface SandboxPromptOptions {
  context?: ChatRuntimeContext;
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
