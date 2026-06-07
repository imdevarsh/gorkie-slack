import PQueue from 'p-queue';

const MAX_QUEUE_DEPTH = 20;

const queues = new Map<string, PQueue>();

export function getQueue(ctxId: string) {
  let queue = queues.get(ctxId);
  if (!queue) {
    queue = new PQueue({ concurrency: 1 });
    queue.once('idle', () => queues.delete(ctxId));
    queues.set(ctxId, queue);
  }
  return queue;
}

export function isQueueFull(ctxId: string): boolean {
  const queue = queues.get(ctxId);
  return queue !== undefined && queue.size >= MAX_QUEUE_DEPTH;
}

export function clearQueue(ctxId: string): void {
  queues.get(ctxId)?.clear();
}
