import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
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
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Skipping',
        status: 'pending',
      });
    },
    execute: async ({ reason }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Skipping',
        details: reason ?? undefined,
        status: 'in_progress',
      });

      if (reason) {
        const authorId = context.event.user;
        const content = context.event.text ?? '';
        const author = authorId
          ? await getSlackUserName(context.client, authorId)
          : 'unknown';
        logger.info(
          { ctxId, reason, message: `${author}: ${content}` },
          'Skipping reply'
        );
      }
      await finishTask(stream, { status: 'complete', taskId: task });
      return {
        success: true,
      };
    },
  });
