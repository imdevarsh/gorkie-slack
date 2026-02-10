import { tool } from 'ai';
import { z } from 'zod';
import { sandboxAgent } from '~/lib/ai/agents';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getConversationMessages } from '~/slack/conversations';
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
      'Delegate a task to the sandbox agent for code execution, file processing, or data analysis.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish in the sandbox. Include file names, expected outputs, and any specific instructions.'
        ),
    }),
    execute: async ({ task }) => {
      await setStatus(context, {
        status: 'is delegating a task to the sandbox',
        loading: true,
      });

      try {
        const channel = (context.event as { channel?: string }).channel;
        const threadTs = (context.event as { thread_ts?: string }).thread_ts;
        const recent = channel
          ? await getConversationMessages({
              client: context.client,
              channel,
              threadTs,
              botUserId: context.botUserId,
              limit: 5,
            })
          : [];
        const recentText = recent
          .map((message) =>
            typeof message.content === 'string'
              ? message.content
              : message.content
                  .map((part) => ('text' in part ? part.text : '[image]'))
                  .join(' ')
          )
          .join('\n');
        const contextBlock = recentText
          ? `Recent thread context (last 5 messages):\n${recentText}\n\n`
          : '';

        const agent = sandboxAgent({ context, files });
        const result = await agent.generate({
          prompt: `${contextBlock}${task}`,
        });

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
