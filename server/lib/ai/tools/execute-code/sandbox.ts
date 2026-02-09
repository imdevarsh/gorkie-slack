import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';

async function reconnect(ctxId: string): Promise<Sandbox | null> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return null;
  }

  try {
    const existing = await Sandbox.get({ sandboxId });
    if (existing.status === 'running') {
      return existing;
    }
  } catch {
    // expired or unreachable
  }

  await redis.del(redisKeys.sandbox(ctxId));
  return null;
}

export async function getOrCreate(ctxId: string): Promise<Sandbox> {
  const existing = await reconnect(ctxId);
  if (existing) {
    await redis.expire(redisKeys.sandbox(ctxId), config.redisTtlSeconds);
    return existing;
  }

  const instance = await Sandbox.create({
    runtime: config.runtime,
    timeout: config.timeoutMs,
  });

  await redis.set(redisKeys.sandbox(ctxId), instance.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.redisTtlSeconds);

  logger.info({ sandboxId: instance.sandboxId, ctxId }, 'Created sandbox');
  return instance;
}
