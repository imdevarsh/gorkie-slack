import { corePrompt } from '../shared/core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { packagesPrompt } from './packages';
import { rolePrompt } from './role';
import { toolsPrompt } from './tools';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(): string {
  return [
    corePrompt,
    rolePrompt,
    environmentPrompt,
    toolsPrompt,
    packagesPrompt,
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
