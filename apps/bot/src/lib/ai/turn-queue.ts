const threadQueues = new Map<string, Promise<void>>();

export function runQueuedTurn({
  run,
  threadId,
}: {
  run: (controller: AbortController) => Promise<void>;
  threadId: string;
}): Promise<void> {
  const queued = (threadQueues.get(threadId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const controller = new AbortController();
      await run(controller);
    });

  threadQueues.set(threadId, queued);
  queued
    .finally(() => {
      if (threadQueues.get(threadId) === queued) {
        threadQueues.delete(threadId);
      }
    })
    .catch(() => undefined);

  return queued;
}
