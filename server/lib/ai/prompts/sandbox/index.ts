import type { SlackMessageContext } from '~/types';
import { corePrompt } from '../shared/core';
import { contextPrompt } from './context';
import { environmentPrompt } from './environment';
import { examplesPrompt } from './examples';
import { packagesPrompt } from './packages';
import { rolePrompt } from './role';
import { toolsPrompt } from './tools';
import { workflowPrompt } from './workflow';

export function sandboxPrompt(context?: SlackMessageContext): string {
  return [
    corePrompt,
    rolePrompt,
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
