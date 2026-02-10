import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents';
import { setToolStatus } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const sandbox = ({
  context,
  files,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
}) =>
  tool({
    description:
      'Delegate a task to the sandbox agent for code execution, file processing, or data analysis in a persistent Linux VM.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish in the sandbox. Include file names, expected outputs, and any specific instructions.'
        ),
    }),
    execute: async ({ task }) => {
      await setToolStatus(context, 'is working in sandbox');

      try {
        const agent = sandboxAgent({ context, files });
        const result = await agent.generate({ prompt: task });

        logger.info({ steps: result.steps.length }, 'Sandbox agent completed');

        return {
          success: true,
          summary: result.text || 'Task completed.',
          steps: result.steps.length,
        };
      } catch (error) {
        logger.error({ error }, 'Sandbox agent failed');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
