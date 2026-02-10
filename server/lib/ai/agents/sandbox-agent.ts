import { ToolLoopAgent, stepCountIs } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
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
    model: provider.languageModel('code-model'),
    instructions: systemPrompt({
      requestHints: hints,
      context,
      model: 'code-model',
    }),
    tools: {
      executeCode: executeCode({ context, files }),
      showFile: showFile({ context }),
    },
    stopWhen: [stepCountIs(12)],
    temperature: 0.7,
  });
