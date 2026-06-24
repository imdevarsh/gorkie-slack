import type { Message, Thread } from 'chat';

export type AgentErrorStage = 'after_progress' | 'after_text' | 'before_output';

export interface TurnInput {
  message: Message;
  thread: Thread;
}

export type AbortReason = 'interrupt' | 'stop' | 'shutdown';

export interface ActiveTurn {
  controller: AbortController;
  pendingMessages: TurnInput[];
}
