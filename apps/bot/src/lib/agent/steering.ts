import { Message, parseMarkdown } from 'chat';
import type { AbortReason, ActiveTurn, TurnInput } from '@/types/agent';

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

export function pendingResumeInput(
  activeTurn: ActiveTurn
): TurnInput | undefined {
  const latest = activeTurn.pendingMessages.at(-1);
  if (!latest) {
    return;
  }
  if (activeTurn.pendingMessages.length === 1) {
    return latest;
  }

  const text = activeTurn.pendingMessages
    .map(({ message }) => message.text.trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    message: new Message({
      attachments: latest.message.attachments,
      author: latest.message.author,
      formatted: parseMarkdown(text),
      id: latest.message.id,
      isMention: latest.message.isMention,
      links: latest.message.links,
      metadata: latest.message.metadata,
      raw: {
        combinedFrom: activeTurn.pendingMessages.map(({ message }) => ({
          id: message.id,
          text: message.text,
        })),
      },
      text,
      threadId: latest.message.threadId,
    }),
    thread: latest.thread,
  };
}
