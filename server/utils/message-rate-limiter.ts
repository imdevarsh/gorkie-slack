import { messageThreshold } from '~/config';
import { redis, redisKeys } from '~/lib/kv';

async function getMessageCount(ctxId: string): Promise<number> {
  const key = redisKeys.messageCount(ctxId);
  const n = await redis.get(key);
  return n ? Number(n) : 0;
}

async function incrementMessageCount(ctxId: string): Promise<number> {
  const key = redisKeys.messageCount(ctxId);
  const n = await redis.incr(key);
  await redis.expire(key, 3600);
  return n ? Number(n) : 1;
}

export async function resetMessageCount(ctxId: string): Promise<void> {
  await redis.del(redisKeys.messageCount(ctxId));
}

export async function handleMessageCount(
  ctxId: string,
  willReply: boolean
): Promise<number> {
  if (willReply) {
    await resetMessageCount(ctxId);
    return 0;
  }

  return await incrementMessageCount(ctxId);
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
