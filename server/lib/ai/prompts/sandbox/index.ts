import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { toolsPrompt } from './tools';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(): string {
  return [
    corePrompt,
    environmentPrompt,
    toolsPrompt,
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
