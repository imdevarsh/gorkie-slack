import type { Message, Thread } from 'chat';

export interface TurnInput {
  message: Message;
  thread: Thread;
}

export type AbortReason = 'interrupt' | 'stop' | 'shutdown';

// Carried as the AbortSignal reason so the turn loop knows why it was aborted:
// an `interrupt` restarts with the queued follow-up; `stop`/`shutdown` do not.
export class TurnAbort extends Error {
  readonly reason: AbortReason;
  constructor(reason: AbortReason) {
    super(`turn aborted: ${reason}`);
    this.name = 'TurnAbort';
    this.reason = reason;
  }
}

export interface ActiveTurn {
  controller: AbortController;
  pendingMessages: TurnInput[];
}

export function abortReasonOf(signal: AbortSignal): AbortReason | undefined {
  if (!signal.aborted) {
    return;
  }
  return signal.reason instanceof TurnAbort
    ? signal.reason.reason
    : 'interrupt';
}

export function interruptTurn({
  activeTurn,
  input,
}: {
  activeTurn: ActiveTurn;
  input: TurnInput;
}): void {
  activeTurn.pendingMessages.push(input);
  activeTurn.controller.abort(new TurnAbort('interrupt'));
}
