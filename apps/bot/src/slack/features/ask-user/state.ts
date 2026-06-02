import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
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

const flows = new Map<string, AskUserFlow>();

export function createAskUserFlow({
  context,
  messages,
  questions,
  requestHints,
}: {
  context: SlackMessageContext;
  messages: ModelMessage[];
  questions: AskUserQuestion[];
  requestHints: ChatRequestHints;
}): AskUserFlow {
  const flow = {
    answers: {},
    context,
    id: `que_${randomUUID()}`,
    index: 0,
    messages,
    questions,
    requestHints,
  };
  flows.set(flow.id, flow);
  return flow;
}

export function getAskUserFlow({ id }: { id: string }): AskUserFlow | null {
  return flows.get(id) ?? null;
}

export function saveAskUserFlow({ flow }: { flow: AskUserFlow }): void {
  flows.set(flow.id, flow);
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
