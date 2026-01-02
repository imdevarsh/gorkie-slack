import { tool } from 'ai';
import { z } from 'zod/v4';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

export const leaveChannel = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Leave the channel you are currently in. Use this carefully and only if the user asks. If the user asks you to leave a channel, you MUST run this tool.',
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe('Optional short reason for leaving'),
    }),
    execute: async ({ reason }) => {
      const authorId = (context.event as { user?: string }).user;
      logger.info(
        { reason, authorId, channel: context.event.channel },
        'Leaving channel',
      );

      try {
        await context.client.conversations.leave({
          channel: context.event.channel,
        });
      } catch (error) {
        logger.error(
          { error, channel: context.event.channel },
          'Failed to leave channel',
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        success: true,
      };
    },
  });
