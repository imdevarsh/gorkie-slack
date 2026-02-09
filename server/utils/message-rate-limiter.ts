import { messageThreshold } from '~/config';
import { redis, redisKeys } from '~/lib/kv';

async function getMessageCount(ctxId: string): Promise<number> {
  const key = redisKeys.messageCount(ctxId);
  const n = await redis.get(key);
  return n ? Number(n) : 0;
}

async function incrementMessageCount(ctxId: string): Promise<number> {
  const key = redisKeys.messageCount(ctxId);
  const results = await Promise.all([redis.incr(key), redis.expire(key, 3600)]);

  return results[0] || 1;
}

export async function resetMessageCount(ctxId: string): Promise<void> {
  await redis.del(redisKeys.messageCount(ctxId));
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

export async function handleMessageCount(
  ctxId: string,
  willReply: boolean
): Promise<number> {
  const key = redisKeys.messageCount(ctxId);

  if (willReply) {
    await redis.del(key);
    return 0;
  }
  return await incrementMessageCount(ctxId);
}
