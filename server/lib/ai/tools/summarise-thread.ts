import { generateText, tool } from 'ai';
import { z } from 'zod';
import { summariseThreadPrompt } from '~/lib/ai/prompts/chat/tasks';
import { provider } from '~/lib/ai/providers';
import { setToolStatus } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import { getConversationMessages } from '~/slack/conversations';
import type { SlackMessageContext } from '~/types';

export const summariseThread = ({
  context,
}: {
  context: SlackMessageContext;
}) =>
  tool({
    description: 'Returns a summary of the current Slack thread.',
    inputSchema: z.object({
      instructions: z
        .string()
        .optional()
        .describe('Optional instructions to provide to the summariser agent'),
    }),
    execute: async ({ instructions }) => {
      await setToolStatus(context, 'is reading the thread');
      const channelId = (context.event as { channel?: string }).channel;
      const threadTs = (context.event as { thread_ts?: string }).thread_ts;

      if (!channelId) {
        return {
          success: false,
          error: 'Could not determine channel ID',
        };
      }

      if (!threadTs) {
        return {
          success: false,
          error:
            'This message is not in a thread. Thread summarisation only works within threads.',
        };
      }

      try {
        const messages = await getConversationMessages({
          client: context.client,
          channel: channelId,
          threadTs,
          botUserId: context.botUserId,
          limit: 1000,
        });

        if (messages.length === 0) {
          return {
            success: false,
            error: 'No messages found in the thread',
          };
        }

        await setToolStatus(context, 'is summarizing the thread');
        const { text } = await generateText({
          model: provider.languageModel('summariser-model'),
          messages,
          system: summariseThreadPrompt(instructions),
          temperature: 0.7,
        });

        logger.debug(
          { channelId, threadTs, messageCount: messages.length },
          'Thread summarised successfully'
        );

        return {
          success: true,
          summary: text,
          messageCount: messages.length,
        };
      } catch (error) {
        logger.error(
          { error, channelId, threadTs },
          'Failed to summarise thread'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
