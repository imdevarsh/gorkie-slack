import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';

export interface State {
  sandboxId: string | null;
}

export async function getState(ctxId: string): Promise<State> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  return { sandboxId: sandboxId ?? null };
}

export async function setSandboxId(
  ctxId: string,
  sandboxId: string
): Promise<void> {
  await redis.set(redisKeys.sandbox(ctxId), sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
}

export async function clearSandbox(ctxId: string): Promise<void> {
  await redis.del(redisKeys.sandbox(ctxId));
}
