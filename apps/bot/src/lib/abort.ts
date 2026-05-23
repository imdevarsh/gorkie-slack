const controllers = new Map<string, AbortController>();

export function createAbortController(ctxId: string): AbortController {
  const controller = new AbortController();
  controllers.set(ctxId, controller);
  return controller;
}

export function clearAbortController(ctxId: string): void {
  controllers.delete(ctxId);
}

export function abortStream(ctxId: string): void {
  controllers.get(ctxId)?.abort();
  controllers.delete(ctxId);
}
