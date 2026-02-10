import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';

export function getSandboxId(ctxId: string): Promise<string | null> {
  return redis.get(redisKeys.sandbox(ctxId));
}

export async function setSandboxId(
  ctxId: string,
  sandboxId: string
): Promise<void> {
  await redis.set(redisKeys.sandbox(ctxId), sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
}

export async function clearSandboxId(ctxId: string): Promise<void> {
  await redis.del(redisKeys.sandbox(ctxId));
}

export function getSnapshotRaw(ctxId: string): Promise<string | null> {
  return redis.get(redisKeys.snapshot(ctxId));
}

export async function clearSnapshotRaw(ctxId: string): Promise<void> {
  await redis.del(redisKeys.snapshot(ctxId));
}
