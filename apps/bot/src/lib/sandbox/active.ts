const active = new Map<string, AbortController>();

export function setActiveSandboxController(
  ctxId: string,
  controller: AbortController
): void {
  active.set(ctxId, controller);
}

export function clearActiveSandboxController(ctxId: string): void {
  active.delete(ctxId);
}

export function abortActiveSandbox(ctxId: string): void {
  active.get(ctxId)?.abort();
}
