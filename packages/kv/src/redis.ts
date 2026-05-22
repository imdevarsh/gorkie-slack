import { RedisClient } from 'bun';
import { keys } from './keys';

export function createRedisClient({
  url = keys().REDIS_URL,
}: {
  url?: string;
} = {}): RedisClient {
  if (!url) {
    throw new Error('REDIS_URL is required to create a Redis client');
  }

  return new RedisClient(url);
}
