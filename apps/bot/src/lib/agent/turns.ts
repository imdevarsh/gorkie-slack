import { TurnAbort } from '@/lib/agent/steering';
import type { ActiveTurn } from '@/lib/agent/types/steering';

const turns = new Map<string, ActiveTurn>();

export function getTurn({
  threadId,
}: {
  threadId: string;
}): ActiveTurn | undefined {
  return turns.get(threadId);
}

export function setTurn({
  threadId,
  turn,
}: {
  threadId: string;
  turn: ActiveTurn;
}): void {
  turns.set(threadId, turn);
}

export function clearTurn({
  threadId,
  turn,
}: {
  threadId: string;
  turn: ActiveTurn;
}): void {
  if (turns.get(threadId) === turn) {
    turns.delete(threadId);
  }
}

export function stopTurn({ threadId }: { threadId: string }): boolean {
  const turn = turns.get(threadId);
  if (!turn) {
    return false;
  }
  turn.controller.abort(new TurnAbort('stop'));
  return true;
}

export function stopAllTurns(): void {
  for (const turn of turns.values()) {
    turn.controller.abort(new TurnAbort('shutdown'));
  }
}
