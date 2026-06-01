import { clampText } from '@repo/utils/text';
import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import type { SlackMessageContext, Stream } from '@/types';

export const askUser = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Ask the user a necessary follow-up question when you cannot continue the task without their input. Use this instead of guessing missing private details.',
    inputSchema: z.object({
      mode: z.enum(['choice', 'freeform']).default('freeform'),
      question: z.string().min(1).max(500),
      options: z
        .array(z.string().min(1).max(80))
        .min(2)
        .max(5)
        .optional()
        .describe('Short choices to show when mode is choice.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Asking user',
        status: 'pending',
      });
    },
    execute: async ({ mode, options, question }, { toolCallId }) => {
      const channel = context.event.channel;
      const threadTs = context.event.thread_ts ?? context.event.ts;
      const choices =
        mode === 'choice' && options?.length
          ? `\n${options.map((option) => `• ${option}`).join('\n')}`
          : '';

      await context.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: question,
        blocks: [
          {
            type: 'card',
            title: { type: 'mrkdwn', text: 'Question for you' },
            body: {
              type: 'mrkdwn',
              text: clampText(`${question}${choices}`, 200),
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Reply in this thread and Gorkie will continue.',
              },
            ],
          },
        ],
      });
      await finishTask(stream, {
        taskId: toolCallId,
        status: 'complete',
        output: 'Waiting for user input',
      });
      return {
        success: true,
        awaitingUserInput: true,
        question,
      };
    },
  });
