import {
  createAskUserApproval,
  getAskUserApproval as getAskUserApprovalRecord,
  updateAskUserApproval,
} from '@repo/db/queries';
import { decryptSecret, encryptSecret } from '@repo/utils';
import type { WebClient } from '@slack/web-api';
import type { ModelMessage } from 'ai';
import { env } from '@/env';
import type { ChatRequestHints, SlackMessageContext } from '@/types';

export interface AskUserChoice {
  description?: string;
  id: string;
  title: string;
}

export type AskUserQuestionType = 'multi_choice' | 'single_choice' | 'text';

export interface AskUserQuestion {
  allowOther?: boolean;
  choices: AskUserChoice[];
  id: string;
  nextLabel?: string;
  otherPlaceholder?: string;
  skippable?: boolean;
  title: string;
  type: AskUserQuestionType;
}

interface StoredAskUserQuestion {
  allowOther?: boolean;
  choices?: AskUserChoice[];
  id: string;
  mode?: 'choice' | 'text';
  multiSelect?: boolean;
  nextLabel?: string;
  options?: AskUserChoice[];
  otherPlaceholder?: string;
  skippable?: boolean;
  title: string;
  type?: AskUserQuestionType;
}

export interface AskUserApprovalState {
  answers: Record<string, string[]>;
  completed?: boolean;
  context: SlackMessageContext;
  id: string;
  index: number;
  message?: {
    channel: string;
    ts: string;
  };
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
}

function encodeApprovalState({
  approval,
}: {
  approval: AskUserApprovalState;
}): string {
  return encryptSecret({
    plaintext: JSON.stringify({
      answers: approval.answers,
      index: approval.index,
      messages: approval.messages,
      questions: approval.questions,
      requestHints: approval.requestHints,
    }),
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
  });
}

function decodeApprovalState({ state }: { state: string }): {
  answers: Record<string, string[]>;
  index: number;
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
} {
  const decoded: {
    answers: Record<string, string[]>;
    index: number;
    messages: ModelMessage[];
    questions: StoredAskUserQuestion[];
    requestHints: ChatRequestHints;
  } = JSON.parse(
    decryptSecret({
      encrypted: state,
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    })
  );

  return {
    ...decoded,
    questions: decoded.questions.map((question) =>
      normalizeAskUserQuestion({ question })
    ),
  };
}

export function normalizeAskUserQuestion({
  question,
}: {
  question: StoredAskUserQuestion;
}): AskUserQuestion {
  const choices = question.choices ?? question.options ?? [];
  let requestedType = question.type ?? 'text';
  if (!question.type && question.mode === 'text') {
    requestedType = 'text';
  } else if (!question.type && question.multiSelect) {
    requestedType = 'multi_choice';
  } else if (
    !question.type &&
    (question.mode === 'choice' || choices.length > 0)
  ) {
    requestedType = 'single_choice';
  }
  const type =
    requestedType === 'text' || choices.length > 0 || question.allowOther
      ? requestedType
      : 'text';

  return {
    choices,
    id: question.id,
    title: question.title,
    type,
    ...(question.allowOther === undefined
      ? {}
      : { allowOther: question.allowOther }),
    ...(question.nextLabel === undefined
      ? {}
      : { nextLabel: question.nextLabel }),
    ...(question.otherPlaceholder === undefined
      ? {}
      : { otherPlaceholder: question.otherPlaceholder }),
    ...(question.skippable === undefined
      ? {}
      : { skippable: question.skippable }),
  };
}

export async function createAskUserApprovalState({
  context,
  messages,
  questions,
  requestHints,
}: {
  context: SlackMessageContext;
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
}): Promise<AskUserApprovalState> {
  const threadTs = context.event.thread_ts ?? context.event.ts;
  const approval = {
    answers: {},
    context,
    id: '',
    index: 0,
    messages,
    questions: questions.map((question) =>
      normalizeAskUserQuestion({ question })
    ),
    requestHints,
  };
  const record = await createAskUserApproval({
    channelId: context.event.channel,
    eventTs: context.event.ts,
    state: encodeApprovalState({ approval: { ...approval, id: 'pending' } }),
    status: 'pending',
    teamId: context.teamId ?? null,
    threadTs,
    userId: context.event.user ?? '',
  });

  if (!record) {
    throw new Error('Failed to create ask user approval.');
  }

  return {
    ...approval,
    id: record.approvalId,
  };
}

export async function getAskUserApprovalState({
  botUserId,
  client,
  id,
  teamId,
  userId,
}: {
  botUserId?: string;
  client: WebClient;
  id: string;
  teamId?: string;
  userId: string;
}): Promise<AskUserApprovalState | null> {
  const record = await getAskUserApprovalRecord({ approvalId: id, userId });
  if (!record) {
    return null;
  }

  const state = decodeApprovalState({ state: record.state });
  return {
    ...state,
    completed: record.status !== 'pending',
    context: {
      botUserId,
      client,
      teamId: record.teamId ?? teamId,
      event: {
        channel: record.channelId,
        event_ts: record.eventTs,
        text: '',
        thread_ts: record.threadTs,
        ts: record.eventTs,
        user: record.userId,
      },
    },
    id: record.approvalId,
    ...(record.messageTs
      ? {
          message: {
            channel: record.channelId,
            ts: record.messageTs,
          },
        }
      : {}),
  };
}

export async function saveAskUserApprovalState({
  approval,
}: {
  approval: AskUserApprovalState;
}): Promise<void> {
  await updateAskUserApproval({
    approvalId: approval.id,
    userId: approval.context.event.user ?? '',
    values: {
      ...(approval.message?.ts ? { messageTs: approval.message.ts } : {}),
      state: encodeApprovalState({ approval }),
      status: approval.completed ? 'approved' : 'pending',
    },
  });
}

export function askUserAnswerSummary({
  approval,
}: {
  approval: AskUserApprovalState;
}): string {
  return approval.questions
    .map((question) => {
      const selected = approval.answers[question.id] ?? [];
      const titles = selected
        .map((optionId) => {
          if (question.type === 'text') {
            return optionId;
          }
          if (optionId.startsWith('other:')) {
            return optionId.slice('other:'.length);
          }
          return (
            question.choices.find((option) => option.id === optionId)?.title ??
            (optionId === 'other'
              ? (question.otherPlaceholder ?? 'Other')
              : null) ??
            optionId
          );
        })
        .join(', ');
      return `${question.title}: ${titles || 'Skipped'}`;
    })
    .join('\n');
}
