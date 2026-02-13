import PQueue from 'p-queue';

const queues = new Map<string, PQueue>();

export function getQueue(ctxId: string) {
  let queue = queues.get(ctxId);
  if (!queue) {
    queue = new PQueue({ concurrency: 1, timeout: 5 * 60 * 1000 });
    queue.once('idle', () => queues.delete(ctxId));
    queues.set(ctxId, queue);
  }
  return queue;
}
