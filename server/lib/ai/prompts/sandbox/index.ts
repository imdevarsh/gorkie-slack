import { sandboxEnvironmentPrompt } from './environment';
import { sandboxExamplesPrompt } from './examples';
import { sandboxPackagesPrompt } from './packages';
import { sandboxRolePrompt } from './role';
import { sandboxToolsPrompt } from './tools';
import { sandboxWorkflowPrompt } from './workflow';

export function sandboxPrompt(): string {
  return [
    sandboxRolePrompt,
    sandboxEnvironmentPrompt,
    sandboxToolsPrompt,
    sandboxPackagesPrompt,
    sandboxWorkflowPrompt,
    sandboxExamplesPrompt,
  ]
    .join('\n')
    .trim();
}
