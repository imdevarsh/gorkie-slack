import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(): string {
  return [corePrompt, environmentPrompt, workflowPrompt]
    .filter(Boolean)
    .join('\n')
    .trim();
}
