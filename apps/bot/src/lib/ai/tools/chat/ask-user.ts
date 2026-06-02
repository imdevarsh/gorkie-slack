import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import { askUserBlocks } from '@/slack/features/ask-user/components';
import {
  type AskUserQuestion,
  createAskUserApprovalState,
  saveAskUserApprovalState,
} from '@/slack/features/ask-user/state';
import type { ChatRequestHints, SlackMessageContext, Stream } from '@/types';

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
  mode: z.enum(['choice', 'text']).optional(),
  multiSelect: z.boolean().optional(),
  skippable: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  otherPlaceholder: z.string().min(1).max(80).optional(),
  nextLabel: z.string().min(1).max(40).optional(),
  options: z.array(optionSchema).max(5).optional(),
});

export const askUser = ({
  context,
  requestHints,
  stream,
}: {
  context: SlackMessageContext;
  requestHints: ChatRequestHints;
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
    execute: async (
      { mode, options, question, questions },
      { messages, toolCallId }
    ) => {
      const channel = context.event.channel;
      const threadTs = context.event.thread_ts ?? context.event.ts;
      const rawQuestions = questions?.length
        ? questions
        : [
            {
              id: 'question',
              title: question ?? 'What should I know?',
              mode: mode === 'freeform' ? 'text' : 'choice',
              options: mode === 'choice' && options?.length ? options : [],
              allowOther: mode === 'freeform',
            },
          ];
      const approval = await createAskUserApprovalState({
        context,
        messages,
        questions: rawQuestions.map((item): AskUserQuestion => {
          const seenIds = new Set<string>();
          let questionMode: AskUserQuestion['mode'] = 'text';
          if (item.mode === 'choice' || item.mode === 'text') {
            questionMode = item.mode;
          } else if (item.options?.length) {
            questionMode = 'choice';
          }
          return {
            ...item,
            mode: questionMode,
            options: (item.options ?? []).map((option, index) => {
              const normalized =
                typeof option === 'string'
                  ? { id: `option_${index + 1}`, title: option }
                  : option;
              if (seenIds.has(normalized.id)) {
                return { ...normalized, id: `${normalized.id}_${index + 1}` };
              }
              seenIds.add(normalized.id);
              return normalized;
            }),
          };
        }),
        requestHints,
      });

      const posted = await context.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: approval.questions[0]?.title ?? 'Question for you',
        blocks: askUserBlocks({ approval }),
      });
      if (posted.ts) {
        approval.message = {
          channel: posted.channel ?? channel,
          ts: posted.ts,
        };
        await saveAskUserApprovalState({ approval });
      }
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
