import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { bash } from '~/lib/ai/tools/sandbox/bash';
import { readFile } from '~/lib/ai/tools/sandbox/read-file';
import { showFile } from '~/lib/ai/tools/sandbox/show-file';
import { searchWeb } from '~/lib/ai/tools/shared/search-web';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { getUserInfo } from '../tools/shared/get-user-info';
import { getWeather } from '../tools/shared/get-weather';

export const sandboxAgent = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: systemPrompt({ agent: 'sandbox' }),
    tools: {
      bash: bash({ context, files }),
      showFile: showFile({ context }),
      readFile: readFile({ context }),
      searchWeb,
      getUserInfo: getUserInfo({ context }),
      getWeather,
    },
    stopWhen: stepCountIs(15),
    temperature: 0.7,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox',
    },
  });
