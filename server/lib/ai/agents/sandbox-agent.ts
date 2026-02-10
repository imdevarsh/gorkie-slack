import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { executeCode } from '~/lib/ai/tools/execute-code';
import { readFile } from '~/lib/ai/tools/read-file';
import { showFile } from '~/lib/ai/tools/show-file';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

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
      executeCode: executeCode({ context, files }),
      showFile: showFile({ context }),
      readFile: readFile({ context }),
    },
    stopWhen: stepCountIs(15),
    temperature: 0.7,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox',
    },
  });
