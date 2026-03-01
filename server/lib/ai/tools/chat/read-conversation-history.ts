import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { fetchMessages } from '~/slack/conversations';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

export const readConversationHistory = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Read message history from a public Slack channel or thread using a channel ID and an optional thread timestamp.',
    inputSchema: z.object({
      channelId: z
        .string()
        .default(context.event.channel ?? '')
        .describe('Target Slack channel ID.'),
      threadTs: z
        .string()
        .optional()
        .describe(
          'Optional thread timestamp. Use this to read a specific thread.'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(40)
        .describe('Maximum number of messages to return (1-200).'),
      latest: z
        .string()
        .optional()
        .describe('Optional upper timestamp bound for returned messages.'),
      oldest: z
        .string()
        .optional()
        .describe('Optional lower timestamp bound for returned messages.'),
      inclusive: z
        .boolean()
        .default(false)
        .describe(
          'When true, include messages exactly at latest/oldest boundaries.'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Reading conversation history',
        status: 'pending',
      });
    },
    execute: async (
      { channelId, threadTs, limit, latest, oldest, inclusive },
      { toolCallId }
    ) => {
      const ctxId = getContextId(context);

      if (!channelId) {
        return {
          success: false,
          error: 'Could not determine channel ID',
        };
      }

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Reading conversation history',
        details: threadTs ? `${channelId} (thread ${threadTs})` : channelId,
        status: 'in_progress',
      });

      try {
        const info = await context.client.conversations.info({
          channel: channelId,
        });
        const channel = info.channel;

        if (!channel) {
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: 'Channel not found',
          });
          return {
            success: false,
            error: 'Channel not found',
          };
        }

        const isPrivateConversation =
          channel.is_private ||
          channel.is_im ||
          channel.is_mpim ||
          channel.is_group;
        if (isPrivateConversation) {
          const message =
            'Reading private conversations is not allowed. Use a public channel instead.';
          logger.warn(
            { ctxId, channelId },
            'Blocked private conversation read'
          );
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: message,
          });
          return {
            success: false,
            error: message,
          };
        }

        const messages = await fetchMessages({
          client: context.client,
          channel: channelId,
          threadTs,
          limit,
          latest,
          oldest,
          inclusive,
        });

        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `${messages.length} message(s) read`,
        });
        return {
          success: true,
          channelId,
          threadTs: threadTs ?? null,
          messageCount: messages.length,
          messages,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channelId, threadTs },
          'Failed to read conversation history'
        );
        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: errorMessage(error),
        });
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
