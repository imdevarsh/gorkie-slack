import type { PiRpcClient } from './rpc/client';

const active = new Map<string, PiRpcClient>();

export function setSandboxClient(ctxId: string, client: PiRpcClient): void {
  active.set(ctxId, client);
}

export function clearSandboxClient(ctxId: string): void {
  active.delete(ctxId);
}

export async function abortActiveSandbox(ctxId: string): Promise<void> {
  await active
    .get(ctxId)
    ?.abort()
    .catch(() => null);
}
