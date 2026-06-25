import { Message, parseMarkdown } from 'chat';
import type { AbortReason, ActiveTurn, TurnInput } from '@/types/agent';

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
  const { reason } = signal;
  return reason instanceof TurnAbort ? reason.reason : 'interrupt';
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

export function queuedFollowUpInput(
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
