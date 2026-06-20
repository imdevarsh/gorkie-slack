import type { PromptControl } from '@repo/ai';
import type { Message, Thread } from 'chat';
import logger from '@/lib/logger';

export interface ActiveTurn {
  controller: AbortController;
  flushing?: boolean;
  pendingMessages: Array<{ message: Message; thread: Thread }>;
  submitUserMessage?: (text: string) => PromiseLike<void>;
}

export async function steerActiveTurn({
  activeTurn,
  input,
}: {
  activeTurn: ActiveTurn;
  input: { message: Message; thread: Thread };
}): Promise<void> {
  activeTurn.pendingMessages.push(input);
  await flushSteering({ activeTurn, threadId: input.thread.id });
}

export function setPromptControl({
  activeTurn,
  control,
  threadId,
}: {
  activeTurn: ActiveTurn;
  control: PromptControl | undefined;
  threadId: string;
}): void {
  activeTurn.submitUserMessage = control?.submitUserMessage
    ? (text) => control.submitUserMessage?.(text) ?? Promise.resolve()
    : undefined;

  if (
    control &&
    !control.submitUserMessage &&
    activeTurn.pendingMessages.length > 0
  ) {
    activeTurn.controller.abort();
    return;
  }

  flushSteering({ activeTurn, threadId }).catch(() => undefined);
}

async function flushSteering({
  activeTurn,
  threadId,
}: {
  activeTurn: ActiveTurn;
  threadId: string;
}): Promise<void> {
  if (activeTurn.flushing) {
    return;
  }

  activeTurn.flushing = true;
  try {
    while (activeTurn.submitUserMessage && activeTurn.pendingMessages[0]) {
      const submit = activeTurn.submitUserMessage;
      const input = activeTurn.pendingMessages[0];
      await submit(input.message.text);
      activeTurn.pendingMessages.shift();
      logger.info({ threadId }, '[agent] turn steered');
    }
  } catch (error) {
    logger.warn(
      { err: error, threadId },
      '[agent] native steering failed, restarting turn'
    );
    activeTurn.controller.abort();
  } finally {
    activeTurn.flushing = false;
  }
}
