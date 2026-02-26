import logger from '~/lib/logger';
import type { ChatRuntimeContext, PlanChunk, Stream, TaskChunk } from '~/types';

export function initStream(context: ChatRuntimeContext): Stream {
  return {
    thread: context.thread,
    tasks: new Map(),
    thought: false,
  };
}

export function closeStream(stream: Stream): void {
  stream.noop = true;
}

export async function setPlanTitle(
  stream: Stream,
  title: string
): Promise<void> {
  await safeAppend(stream, [{ type: 'plan_update', title }]);
}

export async function safeAppend(
  stream: Stream,
  _chunks: (TaskChunk | PlanChunk)[]
): Promise<void> {
  if (stream.noop) {
    return;
  }

  try {
    await stream.thread.startTyping();
  } catch (error) {
    logger.debug({ error }, 'Failed to send typing update');
  }
}
