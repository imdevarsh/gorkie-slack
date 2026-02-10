import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { bash } from '~/lib/ai/tools/sandbox/bash';
import { edit } from '~/lib/ai/tools/sandbox/edit';
import { glob } from '~/lib/ai/tools/sandbox/glob';
import { grep } from '~/lib/ai/tools/sandbox/grep';
import { read } from '~/lib/ai/tools/sandbox/read';
import { showFile } from '~/lib/ai/tools/sandbox/show-file';
import { write } from '~/lib/ai/tools/sandbox/write';
import { searchWeb } from '~/lib/ai/tools/shared/search-web';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { getUserInfo } from '../tools/shared/get-user-info';

interface SandboxAgentOptions {
  context: SlackMessageContext;
  files?: SlackFile[];
  requestHints?: SandboxRequestHints;
}

export function sandboxAgent({
  context,
  files,
  requestHints,
}: SandboxAgentOptions) {
  return new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: systemPrompt({
      agent: 'sandbox',
      context,
      requestHints,
    }),
    tools: {
      bash: bash({ context, files }),
      glob: glob({ context }),
      grep: grep({ context }),
      showFile: showFile({ context }),
      read: read({ context }),
      write: write({ context }),
      edit: edit({ context }),
      searchWeb,
      getUserInfo: getUserInfo({ context }),
    },
    stopWhen: stepCountIs(30),
    temperature: 0.7,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox',
    },
  });
}
