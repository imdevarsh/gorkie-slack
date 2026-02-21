import { RedisClient } from 'bun';
import { env } from '~/env';

export const redis = new RedisClient(env.REDIS_URL);

/*
export const redisKeys = {
  messageCount: (contextId: string) => `gorkie:ctx:messageCount:${contextId}`,
  channelCount: (contextId: string) => `gorkie:ctx:channelCount:${contextId}`,
};
 */
