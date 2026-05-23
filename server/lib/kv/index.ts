import { RedisClient } from 'bun';
import { env } from '~/env';

export const redis = new RedisClient(env.REDIS_URL);
