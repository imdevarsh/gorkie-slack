import PQueue from 'p-queue';

interface ThreadQueue {
  controller?: AbortController;
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

export async function runQueuedTurn({
  onInterrupt,
  run,
  threadId,
}: {
  onInterrupt: () => PromiseLike<void> | void;
  run: (controller: AbortController) => Promise<void>;
  threadId: string;
}): Promise<void> {
  const existing = threadQueues.get(threadId);
  if (existing?.controller) {
    existing.controller.abort();
    await Promise.resolve(onInterrupt()).catch(() => undefined);
  }

  const entry = threadQueue(threadId);
  entry.turns += 1;
  return entry.queue.add(async () => {
    const controller = new AbortController();
    entry.controller = controller;
    try {
      await run(controller);
    } finally {
      if (entry.controller === controller) {
        entry.controller = undefined;
      }
      entry.turns -= 1;
      if (entry.turns === 0) {
        threadQueues.delete(threadId);
      }
    }
  });
}
