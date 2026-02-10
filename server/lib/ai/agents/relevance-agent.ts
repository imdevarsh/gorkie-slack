import { Output, ToolLoopAgent, stepCountIs } from 'ai';
import { z } from 'zod';
import { provider } from '~/lib/ai/providers';
import type { SlackMessageContext } from '~/types';

const relevanceSchema = z.object({
  relevant: z.boolean(),
  reason: z.string(),
});

export const relevanceAgent = ({
  context,
}: {
  context: SlackMessageContext;
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('chat-model'),
    instructions: `You decide whether Gorkie should respond to a message.
Return relevant=true if the user is asking for help, addressing Gorkie, or if the message is in a DM.
Return relevant=false for low-value messages ("gm", emojis), unrelated chatter, or messages not directed to Gorkie.
Always prefer responding when unsure.`,
    output: Output.object({ schema: relevanceSchema }),
    stopWhen: [stepCountIs(5)],
    temperature: 0,
  });
