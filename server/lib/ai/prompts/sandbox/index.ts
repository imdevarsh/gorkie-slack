import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(): string {
  return [corePrompt, environmentPrompt, workflowPrompt, examplesPrompt]
    .filter(Boolean)
    .join('\n')
    .trim();
}
