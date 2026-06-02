import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import { askUserBlocks } from '@/slack/features/ask-user/components';
import {
  type AskUserQuestion,
  createAskUserApprovalState,
  normalizeAskUserQuestion,
  saveAskUserApprovalState,
} from '@/slack/features/ask-user/state';
import type { ChatRequestHints, SlackMessageContext, Stream } from '@/types';

const choiceSchema = z.union([
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
  type: z.enum(['single_choice', 'multi_choice', 'text']).optional(),
  skippable: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  otherPlaceholder: z.string().min(1).max(80).optional(),
  nextLabel: z.string().min(1).max(40).optional(),
  choices: z.array(choiceSchema).max(5).optional(),
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
      type: z.enum(['single_choice', 'multi_choice', 'text']).default('text'),
      question: z.string().min(1).max(500).optional(),
      choices: z
        .array(choiceSchema)
        .min(2)
        .max(5)
        .optional()
        .describe('Short choices to show for single_choice or multi_choice.'),
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
      { choices, question, questions, type },
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
              type,
              choices: type === 'text' ? [] : (choices ?? []),
            },
          ];
      const approval = await createAskUserApprovalState({
        context,
        messages,
        questions: rawQuestions.map((item): AskUserQuestion => {
          const seenIds = new Set<string>();
          const normalizedChoices = (item.choices ?? []).map(
            (choice, index) => {
              const normalized =
                typeof choice === 'string'
                  ? { id: `choice_${index + 1}`, title: choice }
                  : choice;
              if (seenIds.has(normalized.id)) {
                return { ...normalized, id: `${normalized.id}_${index + 1}` };
              }
              seenIds.add(normalized.id);
              return normalized;
            }
          );
          const questionType =
            item.type ??
            (normalizedChoices.length > 0 ? 'single_choice' : 'text');
          return normalizeAskUserQuestion({
            question: {
              id: item.id,
              title: item.title,
              type:
                questionType === 'text' ||
                normalizedChoices.length > 0 ||
                item.allowOther
                  ? questionType
                  : 'text',
              choices: normalizedChoices,
              ...(item.allowOther === undefined
                ? {}
                : { allowOther: item.allowOther }),
              ...(item.nextLabel === undefined
                ? {}
                : { nextLabel: item.nextLabel }),
              ...(item.otherPlaceholder === undefined
                ? {}
                : { otherPlaceholder: item.otherPlaceholder }),
              ...(item.skippable === undefined
                ? {}
                : { skippable: item.skippable }),
            },
          });
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
