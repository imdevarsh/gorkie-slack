import type { SlackMessageContext } from '~/types';
import { contextPrompt } from './context';
import { directivesPrompt } from './directives';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { packagesPrompt } from './packages';
import { rolePrompt } from './role';
import { toolsPrompt } from './tools';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(context?: SlackMessageContext): string {
  return [
    rolePrompt,
    directivesPrompt,
    environmentPrompt,
    contextPrompt(context),
    toolsPrompt,
    packagesPrompt,
    workflowPrompt,
    examplesPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
