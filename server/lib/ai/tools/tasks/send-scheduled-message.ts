import type { WebClient } from '@slack/web-api';
import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { Stream } from '~/types';
import { errorMessage, toLogError } from '~/utils/error';

export const sendScheduledMessage = ({
  client,
  destination,
  stream,
}: {
  client: WebClient;
  destination: {
    channelId: string;
    threadTs?: string | null;
    taskId: string;
  };
  stream: Stream;
}) =>
  tool({
    description:
      'Send the final scheduled-task output to Slack. This should be the last tool call in a run.',
    inputSchema: z.object({
      content: z.string().describe('Final user-facing message to send.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Sending scheduled task output',
        status: 'pending',
      });
    },
    execute: async ({ content }, { toolCallId }) => {
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Sending scheduled task output',
        details: content,
        status: 'in_progress',
      });

      try {
        await client.chat.postMessage({
          channel: destination.channelId,
          markdown_text: content,
          thread_ts: destination.threadTs ?? undefined,
        });

        logger.info(
          {
            taskId: destination.taskId,
            channelId: destination.channelId,
            threadTs: destination.threadTs,
            messageCount: content.length,
          },
          'Delivered scheduled task output'
        );
        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: 'Delivered message',
        });
        return { success: true };
      } catch (error) {
        const message = errorMessage(error);
        logger.error(
          {
            ...toLogError(error),
            taskId: destination.taskId,
            channelId: destination.channelId,
            threadTs: destination.threadTs,
          },
          'Failed to deliver scheduled task output'
        );
        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: message,
        });
        return { success: false, error: message };
      }
    },
  });
