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
import { setStatus } from '~/lib/ai/utils/status';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';
import { getUserInfo } from '../tools/shared/get-user-info';

interface SandboxAgentOptions {
  context: SlackMessageContext;
  requestHints?: SandboxRequestHints;
}

export function sandboxAgent({ context, requestHints }: SandboxAgentOptions) {
  return new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: systemPrompt({
      agent: 'sandbox',
      context,
      requestHints,
    }),
    tools: {
      bash: bash({ context }),
      glob: glob({ context }),
      grep: grep({ context }),
      showFile: showFile({ context }),
      read: read({ context }),
      write: write({ context }),
      edit: edit({ context }),
      searchWeb,
      getUserInfo: getUserInfo({ context }),
    },
    prepareStep: async () => {
      await setStatus(context, { status: 'is thinking', loading: true });
      return {};
    },
    stopWhen: stepCountIs(30),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox',
    },
  });
}
