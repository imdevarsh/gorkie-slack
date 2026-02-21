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
