import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getSlackUserName } from '~/utils/users';

export const skip = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'End without replying to the provided message.',
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe('Optional short reason for skipping'),
    }),
    execute: async ({ reason }) => {
      if (reason) {
        const authorId = (context.event as { user?: string }).user;
        const content = (context.event as { text?: string }).text ?? '';
        const author = authorId
          ? await getSlackUserName(context.client, authorId)
          : 'unknown';
        logger.info(
          { reason, message: `${author}: ${content}` },
          'Skipping reply'
        );
      }

      return {
        success: true,
      };
    },
  });
