import { generateText, tool } from 'ai';
import { z } from 'zod';
import { summariseThreadPrompt } from '~/lib/ai/prompts/chat/tasks';
import { provider } from '~/lib/ai/providers';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getConversationMessages } from '~/slack/conversations';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

export const summariseThread = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description: 'Returns a summary of a Slack thread.',
    inputSchema: z.object({
      instructions: z
        .string()
        .optional()
        .describe('Optional instructions to provide to the summariser agent'),
      channelId: z
        .string()
        .default(context.event.channel ?? '')
        .describe('Channel ID containing the thread to summarise.'),
      threadTs: (context.event.thread_ts
        ? z.string().default(context.event.thread_ts)
        : z.string()
      ).describe('Timestamp of thread to summarise.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Summarising thread',
        status: 'pending',
      });
    },
    execute: async ({ instructions, channelId, threadTs }, { toolCallId }) => {
      const ctxId = getContextId(context);

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

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Summarising thread',
        details: instructions ?? undefined,
        status: 'in_progress',
      });

      try {
        const messages = await getConversationMessages({
          client: context.client,
          channel: channelId,
          threadTs,
          botUserId: context.botUserId,
          limit: 1000,
        });

        if (messages.length === 0) {
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: 'No messages found',
          });
          return {
            success: false,
            error: 'No messages found in the thread',
          };
        }

        const { text } = await generateText({
          model: provider.languageModel('summariser-model'),
          messages,
          system: summariseThreadPrompt(instructions),
        });

        logger.debug(
          { ctxId, channelId, threadTs, messageCount: messages.length },
          'Thread summarised successfully'
        );
        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `${messages.length} messages summarised`,
        });
        return {
          success: true,
          summary: text,
          messageCount: messages.length,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channelId, threadTs },
          'Failed to summarise thread'
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
