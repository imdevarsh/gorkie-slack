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

async function restoreFromSnapshot(ctxId: string): Promise<Sandbox | null> {
  const snapshotId = await redis.get(redisKeys.snapshot(ctxId));
  if (!snapshotId) {
    return null;
  }

  try {
    const instance = await Sandbox.create({
      source: { type: 'snapshot', snapshotId },
      timeout: config.timeoutMs,
    });

    logger.info(
      { snapshotId, sandboxId: instance.sandboxId, ctxId },
      'Restored from snapshot'
    );
    return instance;
  } catch (error) {
    logger.warn({ snapshotId, error, ctxId }, 'Snapshot restore failed');
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }
}

export async function getOrCreate(ctxId: string): Promise<Sandbox> {
  const live = await reconnect(ctxId);
  if (live) {
    return live;
  }

  const restored = await restoreFromSnapshot(ctxId);
  const instance =
    restored ??
    (await Sandbox.create({
      runtime: config.runtime,
      timeout: config.timeoutMs,
    }));

  await redis.set(redisKeys.sandbox(ctxId), instance.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.sandboxTtlSeconds);

  if (!restored) {
    logger.info({ sandboxId: instance.sandboxId, ctxId }, 'Created sandbox');
  }

  return instance;
}

export async function snapshotAndStop(ctxId: string): Promise<void> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return;
  }

  await redis.del(redisKeys.sandbox(ctxId));

  try {
    const instance = await Sandbox.get({ sandboxId });
    if (instance.status !== 'running') {
      return;
    }

    const snap = await instance.snapshot();

    await redis.set(redisKeys.snapshot(ctxId), snap.snapshotId);
    await redis.expire(redisKeys.snapshot(ctxId), config.snapshotTtlSeconds);

    logger.info(
      { sandboxId, snapshotId: snap.snapshotId, ctxId },
      'Snapshot saved'
    );
  } catch (error) {
    logger.warn(
      { sandboxId, error, ctxId },
      'Snapshot failed, stopping sandbox'
    );

    try {
      const instance = await Sandbox.get({ sandboxId });
      await instance.stop();
    } catch {
      // already gone
    }
  }
}
