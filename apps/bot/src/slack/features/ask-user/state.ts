import { randomUUID } from 'node:crypto';

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
  id: string;
  index: number;
  questions: AskUserQuestion[];
}

const flows = new Map<string, AskUserFlow>();

export function createAskUserFlow({
  questions,
}: {
  questions: AskUserQuestion[];
}): AskUserFlow {
  const flow = {
    answers: {},
    id: `que_${randomUUID()}`,
    index: 0,
    questions,
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
