import { RedisClient } from 'bun';
import { env } from '~/env';

export const redis = new RedisClient(env.REDIS_URL);

export async function ratelimit(contextId: string) {
  const now = Date.now();

  const key = `slack:${contextId}`;

  // the following two must run in that order so they aren't in the promise.all
  // TODO: Switch to Lua script or wait for Bun Redis library to get more support
  await redis.zadd(key, now, now.toString());
  await redis.zremrangebyscore(key, 0, now - 30 * 1000);
  const results = await Promise.all([redis.zcard(key), redis.expire(key, 30)]);

  const count = results[0];
  return { success: count <= 7 };
}

export const redisKeys = {
  messageCount: (contextId: string) => `gorkie:ctx:messageCount:${contextId}`,
  channelCount: (contextId: string) => `gorkie:ctx:channelCount:${contextId}`,
};
