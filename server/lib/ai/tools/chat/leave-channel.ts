import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

export const leaveChannel = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
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
      const ctxId = getContextId(context);
      const authorId = (context.event as { user?: string }).user;
      logger.info(
        { ctxId, reason, authorId, channel: context.event.channel },
        'Leaving channel'
      );

      const task = await createTask(stream, { title: 'Leaving channel' });

      try {
        await context.client.conversations.leave({
          channel: context.event.channel,
        });
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channel: context.event.channel },
          'Failed to leave channel'
        );
        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
      await finishTask(stream, task, 'complete');
      return {
        success: true,
      };
    },
  });
