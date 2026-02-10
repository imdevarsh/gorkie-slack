import type { SlackMessageContext } from '~/types';
import { contextPrompt } from './context';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { rolePrompt } from './role';
import { toolsPrompt } from './tools';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(context?: SlackMessageContext): string {
  return [
    rolePrompt,
    environmentPrompt,
    contextPrompt(context),
    toolsPrompt,
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
