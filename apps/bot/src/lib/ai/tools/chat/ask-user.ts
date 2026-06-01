import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import { askUserBlocks } from '@/slack/features/ask-user/components';
import { createAskUserFlow } from '@/slack/features/ask-user/state';
import type { SlackMessageContext, Stream } from '@/types';

const optionSchema = z.union([
  z.string().min(1).max(80),
  z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(120).optional(),
  }),
]);

const questionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  multiSelect: z.boolean().optional(),
  skippable: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  otherPlaceholder: z.string().min(1).max(80).optional(),
  nextLabel: z.string().min(1).max(40).optional(),
  options: z.array(optionSchema).min(1).max(5),
});

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
      question: z.string().min(1).max(500).optional(),
      options: z
        .array(optionSchema)
        .min(2)
        .max(5)
        .optional()
        .describe('Short choices to show when mode is choice.'),
      questions: z
        .array(questionSchema)
        .min(1)
        .max(8)
        .optional()
        .describe('A stepped questionnaire with option descriptions.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Asking user',
        status: 'pending',
      });
    },
    execute: async ({ mode, options, question, questions }, { toolCallId }) => {
      const channel = context.event.channel;
      const threadTs = context.event.thread_ts ?? context.event.ts;
      const normalizedQuestions = questions?.length
        ? questions
        : [
            {
              id: 'question',
              title: question ?? 'What should I know?',
              options:
                mode === 'choice' && options?.length
                  ? options
                  : [
                      {
                        id: 'reply',
                        title: 'Reply in thread',
                        description: 'Answer in your own words',
                      },
                    ],
              allowOther: mode === 'freeform',
            },
          ];
      const flow = createAskUserFlow({
        questions: normalizedQuestions.map((item) => ({
          ...item,
          options: item.options.map((option, index) =>
            typeof option === 'string'
              ? {
                  id: `option_${index + 1}`,
                  title: option,
                }
              : option
          ),
        })),
      });

      await context.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: flow.questions[0]?.title ?? 'Question for you',
        blocks: askUserBlocks({ flow }),
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
