import type { SandboxPromptOptions } from '~/types';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { workflowPrompt } from './workflow';
import { skillsPrompt } from './skills';

export function sandboxPrompt({
  context,
  requestHints,
}: SandboxPromptOptions = {}): string {
  return [
    corePrompt,
    environmentPrompt,
    skillsPrompt,
    contextPrompt({ context, requestHints }),
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
