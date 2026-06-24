import type { Message, Thread } from 'chat';

export interface TurnInput {
  message: Message;
  thread: Thread;
}

export type AbortReason = 'interrupt' | 'stop' | 'shutdown';

export interface ActiveTurn {
  controller: AbortController;
  pendingMessages: TurnInput[];
}
