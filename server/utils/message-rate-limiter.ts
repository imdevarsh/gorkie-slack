import { messageThreshold } from '~/config';
import { redis, redisKeys } from '~/lib/kv';

async function getMessageCount(ctxId: string): Promise<number> {
  const key = redisKeys.messageCount(ctxId);
  const n = await redis.get(key);
  return n ? Number(n) : 0;
}

export async function resetMessageCount(ctxId: string): Promise<void> {
  await redis.del(redisKeys.messageCount(ctxId));
}

export async function handleMessageCount(
  ctxId: string,
  willReply: boolean
): Promise<void> {
  if (willReply) {
    await resetMessageCount(ctxId);
    return;
  }

  const key = redisKeys.messageCount(ctxId);
  await redis.incr(key);
  await redis.expire(key, 30 * 60);
}

export async function checkMessageQuota(ctxId: string): Promise<{
  count: number;
  hasQuota: boolean;
}> {
  const count = await getMessageCount(ctxId);
  return {
    count,
    hasQuota: count < messageThreshold,
  };
}
