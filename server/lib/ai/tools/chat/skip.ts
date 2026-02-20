import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { getSlackUserName } from '~/utils/users';

export const skip = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description: 'End without replying to the provided message.',
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe('Optional short reason for skipping'),
    }),
    execute: async ({ reason }) => {
      const ctxId = getContextId(context);
      const task = await createTask(stream, {
        title: 'Skipping',
        details: reason ?? undefined,
      });

      if (reason) {
        const authorId = (context.event as { user?: string }).user;
        const content = (context.event as { text?: string }).text ?? '';
        const author = authorId
          ? await getSlackUserName(context.client, authorId)
          : 'unknown';
        logger.info(
          { ctxId, reason, message: `${author}: ${content}` },
          'Skipping reply'
        );
      }
      await finishTask(stream, task, 'complete');
      return {
        success: true,
      };
    },
  });
