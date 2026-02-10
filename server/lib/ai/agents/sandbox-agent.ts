import { ToolLoopAgent, stepCountIs } from 'ai';
import { sandboxPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { executeCode } from '~/lib/ai/tools/execute-code';
import { showFile } from '~/lib/ai/tools/show-file';
import type { RequestHints, SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const sandboxAgent = ({
  context,
  hints,
  files,
}: {
  context: SlackMessageContext;
  hints: RequestHints;
  files?: SlackFile[];
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('chat-model'),
    instructions: sandboxPrompt({ requestHints: hints, context }),
    tools: {
      executeCode: executeCode({ context, files }),
      showFile: showFile({ context }),
    },
    stopWhen: [stepCountIs(12)],
    temperature: 0.7,
  });
