import type { SandboxPromptOptions } from '~/types';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { workflowPrompt } from './workflow';

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
