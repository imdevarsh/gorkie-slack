import PQueue from 'p-queue';

interface ThreadQueue {
  queue: PQueue;
  turns: number;
}

const threadQueues = new Map<string, ThreadQueue>();

function threadQueue(threadId: string): ThreadQueue {
  const existing = threadQueues.get(threadId);
  if (existing) {
    return existing;
  }
  const entry: ThreadQueue = {
    queue: new PQueue({ concurrency: 1 }),
    turns: 0,
  };
  threadQueues.set(threadId, entry);
  return entry;
}

export function runQueuedTurn({
  run,
  threadId,
}: {
  run: (controller: AbortController) => Promise<void>;
  threadId: string;
}): Promise<void> {
  const entry = threadQueue(threadId);
  entry.turns += 1;
  return entry.queue.add(async () => {
    const controller = new AbortController();
    try {
      await run(controller);
    } finally {
      entry.turns -= 1;
      if (entry.turns === 0) {
        threadQueues.delete(threadId);
      }
    }
  });
}
