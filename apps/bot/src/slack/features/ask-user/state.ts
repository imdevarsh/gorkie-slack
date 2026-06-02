import {
  createAskUserFlowRecord,
  getAskUserFlowRecord,
  updateAskUserFlowRecord,
} from '@repo/db/queries';
import { decryptSecret, encryptSecret } from '@repo/utils';
import type { WebClient } from '@slack/web-api';
import type { ModelMessage } from 'ai';
import { env } from '@/env';
import type { ChatRequestHints, SlackMessageContext } from '@/types';

export interface AskUserOption {
  description?: string;
  id: string;
  title: string;
}

export interface AskUserQuestion {
  allowOther?: boolean;
  id: string;
  multiSelect?: boolean;
  nextLabel?: string;
  options: AskUserOption[];
  otherPlaceholder?: string;
  skippable?: boolean;
  title: string;
}

export interface AskUserFlow {
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

function encodeFlowState({ flow }: { flow: AskUserFlow }): string {
  return encryptSecret({
    plaintext: JSON.stringify({
      answers: flow.answers,
      index: flow.index,
      messages: flow.messages,
      questions: flow.questions,
      requestHints: flow.requestHints,
    }),
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
  });
}

function decodeFlowState({ state }: { state: string }): {
  answers: Record<string, string[]>;
  index: number;
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
} {
  return JSON.parse(
    decryptSecret({
      encrypted: state,
      secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    })
  );
}

export async function createAskUserFlow({
  context,
  messages,
  questions,
  requestHints,
}: {
  context: SlackMessageContext;
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
}): Promise<AskUserFlow> {
  const threadTs = context.event.thread_ts ?? context.event.ts;
  const flow = {
    answers: {},
    context,
    id: '',
    index: 0,
    messages,
    questions,
    requestHints,
  };
  const record = await createAskUserFlowRecord({
    channelId: context.event.channel,
    eventTs: context.event.ts,
    state: encodeFlowState({ flow: { ...flow, id: 'pending' } }),
    status: 'pending',
    teamId: context.teamId ?? null,
    threadTs,
    userId: context.event.user ?? '',
  });

  if (!record) {
    throw new Error('Failed to create ask user flow.');
  }

  return {
    ...flow,
    id: record.id,
  };
}

export async function getAskUserFlow({
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
}): Promise<AskUserFlow | null> {
  const record = await getAskUserFlowRecord({ id, userId });
  if (!record) {
    return null;
  }

  const state = decodeFlowState({ state: record.state });
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
    id: record.id,
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

export async function saveAskUserFlow({
  flow,
}: {
  flow: AskUserFlow;
}): Promise<void> {
  await updateAskUserFlowRecord({
    id: flow.id,
    userId: flow.context.event.user ?? '',
    values: {
      ...(flow.message?.ts ? { messageTs: flow.message.ts } : {}),
      state: encodeFlowState({ flow }),
      status: flow.completed ? 'completed' : 'pending',
    },
  });
}

export function askUserAnswerSummary({ flow }: { flow: AskUserFlow }): string {
  return flow.questions
    .map((question) => {
      const selected = flow.answers[question.id] ?? [];
      const titles = selected
        .map(
          (optionId) =>
            question.options.find((option) => option.id === optionId)?.title ??
            (optionId === 'other'
              ? (question.otherPlaceholder ?? 'Other')
              : null) ??
            optionId
        )
        .join(', ');
      return `${question.title}: ${titles || 'Skipped'}`;
    })
    .join('\n');
}
