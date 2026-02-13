import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { deleteSnapshotImage } from './modal';

export async function deleteSnapshot(
  imageId: string,
  ctxId: string
): Promise<void> {
  try {
    await deleteSnapshotImage(imageId);
    logger.info({ imageId, ctxId }, '[sandbox] Deleted snapshot image');
  } catch (error) {
    logger.warn(
      { imageId, error, ctxId },
      '[sandbox] Failed to delete snapshot image'
    );
  }
}

export async function cleanupSnapshots(): Promise<void> {
  const cutoff = Date.now() - config.snapshot.ttl * 1000;
  const expired = await redis.zrangebyscore(
    redisKeys.snapshotIndex(),
    0,
    cutoff
  );

  if (expired.length === 0) {
    return;
  }

  await Promise.all(
    expired.map(async (entry) => {
      const [imageId, ctxId] = entry.split(':');
      if (!(imageId && ctxId)) {
        await redis.zrem(redisKeys.snapshotIndex(), entry);
        return;
      }

      await deleteSnapshot(imageId, ctxId);
      await redis.zrem(redisKeys.snapshotIndex(), entry);
    })
  );
}

export async function registerSnapshot(
  ctxId: string,
  imageId: string
): Promise<void> {
  const now = Date.now();
  await redis.set(
    redisKeys.snapshot(ctxId),
    JSON.stringify({ imageId, createdAt: now })
  );
  await redis.expire(redisKeys.snapshot(ctxId), config.snapshot.ttl);
  await redis.zadd(redisKeys.snapshotIndex(), now, `${imageId}:${ctxId}`);
}
