import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents/sandbox-agent';
import type { RequestHints, SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const sandboxAgentTool = ({
  context,
  hints,
  files,
}: {
  context: SlackMessageContext;
  hints: RequestHints;
  files?: SlackFile[];
}) =>
  tool({
    description:
      'Delegate a complex, multi-step task to a sandbox subagent that can run code and generate files.',
    inputSchema: z.object({
      task: z.string().describe('The task to complete in the sandbox.'),
      context: z
        .string()
        .optional()
        .describe('Optional extra context, constraints, or file hints.'),
    }),
    execute: async ({ task, context: extra }, { abortSignal }) => {
      const agent = sandboxAgent({ context, hints, files });
      const prompt = extra
        ? `Task:\n${task}\n\nContext:\n${extra}`
        : `Task:\n${task}`;

      const result = await agent.generate({ prompt, abortSignal });

      return {
        success: true,
        answer: result.text,
      };
    },
  });
