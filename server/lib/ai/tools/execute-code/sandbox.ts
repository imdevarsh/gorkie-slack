import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';

async function preinstallPackages(instance: Sandbox): Promise<void> {
  const packages = config.packages;
  if (!packages.length) {
    return;
  }

  await instance
    .runCommand({
      cmd: 'dnf',
      args: ['install', '-y', ...packages],
      sudo: true
    })
    .catch((error: unknown) => {
      logger.warn({ error, packages }, 'Sandbox preinstall failed');
    });
}

async function reconnect(ctxId: string): Promise<Sandbox | null> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return null;
  }

  const existing = await Sandbox.get({ sandboxId }).catch(() => null);
  if (existing?.status === 'running') {
    return existing;
  }

  await redis.del(redisKeys.sandbox(ctxId));
  return null;
}

async function restoreFromSnapshot(ctxId: string): Promise<Sandbox | null> {
  const snapshotId = await redis.get(redisKeys.snapshot(ctxId));
  if (!snapshotId) {
    return null;
  }

  const instance = await Sandbox.create({
    source: { type: 'snapshot', snapshotId },
    timeout: config.timeoutMs,
  }).catch((error: unknown) => {
    logger.warn({ snapshotId, error, ctxId }, 'Snapshot restore failed');
    return null;
  });

  if (!instance) {
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  logger.info(
    { snapshotId, sandboxId: instance.sandboxId, ctxId },
    'Restored from snapshot'
  );
  return instance;
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

  if (!restored) {
    await preinstallPackages(instance);
  }

  await redis.set(redisKeys.sandbox(ctxId), instance.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.sandboxTtlSeconds);

  if (!restored) {
    logger.info({ sandboxId: instance.sandboxId, ctxId }, 'Created sandbox');
  }

  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}

export async function snapshotAndStop(ctxId: string): Promise<void> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return;
  }

  await redis.del(redisKeys.sandbox(ctxId));

  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (!instance || instance.status !== 'running') {
    return;
  }

  const snap = await instance.snapshot().catch((error: unknown) => {
    logger.warn({ sandboxId, error, ctxId }, 'Snapshot failed');
    return null;
  });

  if (!snap) {
    await forceStop(sandboxId);
    return;
  }

  await redis.set(redisKeys.snapshot(ctxId), snap.snapshotId);
  await redis.expire(redisKeys.snapshot(ctxId), config.snapshotTtlSeconds);

  logger.info(
    { sandboxId, snapshotId: snap.snapshotId, ctxId },
    'Snapshot saved'
  );
}
