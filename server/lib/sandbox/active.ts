import type { PiRpcClient } from './rpc/client';

const GRACEFUL_STOP_TIMEOUT_MS = 60_000;

const active = new Map<string, PiRpcClient>();

export function setActiveSandboxClient(
  ctxId: string,
  client: PiRpcClient
): void {
  active.set(ctxId, client);
}

export function clearActiveSandboxClient(ctxId: string): void {
  active.delete(ctxId);
}

export async function abortActiveSandbox(ctxId: string): Promise<void> {
  const client = active.get(ctxId);
  if (!client) {
    return;
  }
  const idle = client.waitForIdle();
  await client.abort().catch(() => null);
  await Promise.race([
    idle,
    new Promise<void>((resolve) =>
      setTimeout(resolve, GRACEFUL_STOP_TIMEOUT_MS)
    ),
  ]).catch(() => null);
}
