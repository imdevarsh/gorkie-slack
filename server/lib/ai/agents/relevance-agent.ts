import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { provider } from '~/lib/ai/providers';
import type { SlackMessageContext } from '~/types';
import { probabilitySchema } from '~/lib/validators/probability';

export const relevanceAgent = ({
  context,
}: {
  context: SlackMessageContext;
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('relevance-model'),
    instructions: `You decide whether Gorkie should respond to a message.
Return a probability between 0 and 1.
Responding is preferred when unsure.`,
    tools: {
      relevance: tool({
        description:
          'Assess the relevance of a message for Gorkie to respond to.',
        inputSchema: probabilitySchema,
      }),
    },
    prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          toolChoice: { type: 'tool', toolName: 'relevance' },
        };
      }

      return {};
    },
    toolChoice: 'required',
    stopWhen: [stepCountIs(6)],
    temperature: 0,
  });
