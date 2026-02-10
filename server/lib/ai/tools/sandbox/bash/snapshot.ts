import { Snapshot } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { Sandbox } from '@vercel/sandbox';

const SNAPSHOT_INDEX_SEPARATOR = ':';

export async function deleteSnapshot(
  snapshotId: string,
  ctxId: string
): Promise<void> {
  try {
    const snapshot = await Snapshot.get({ snapshotId });
    await snapshot.delete();
    logger.info({ snapshotId, ctxId }, 'Deleted snapshot');
  } catch (error) {
    logger.warn({ snapshotId, error, ctxId }, 'Failed to delete snapshot');
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
      const [snapshotId, ctxId] = entry.split(SNAPSHOT_INDEX_SEPARATOR);
      if (!snapshotId || !ctxId) {
        await redis.zrem(redisKeys.snapshotIndex(), entry);
        return;
      }

      await deleteSnapshot(snapshotId, ctxId);
      await redis.zrem(redisKeys.snapshotIndex(), entry);
    })
  );
}

export async function registerSnapshot(
  ctxId: string,
  snapshotId: string
): Promise<void> {
  const now = Date.now();
  await redis.set(redisKeys.snapshot(ctxId), snapshotId);
  await redis.set(redisKeys.snapshotMeta(ctxId), now.toString());
  await Promise.all([
    redis.expire(redisKeys.snapshot(ctxId), config.snapshot.ttl),
    redis.expire(redisKeys.snapshotMeta(ctxId), config.snapshot.ttl),
  ]);
  await redis.zadd(
    redisKeys.snapshotIndex(),
    now,
    `${snapshotId}${SNAPSHOT_INDEX_SEPARATOR}${ctxId}`
  );
}

export async function logSnapshotSizes(
  instance: Sandbox,
  ctxId: string,
  sandboxId: string
): Promise<void> {
  const totalKb = await runDu(instance, [
    '/',
    '--exclude=/proc',
    '--exclude=/sys',
    '--exclude=/dev',
    '--exclude=/run',
  ]);
  if (Number.isFinite(totalKb)) {
    logger.info(
      { sandboxId, ctxId, totalKb },
      'Sandbox size (KB) before snapshot'
    );
  }

  const homeKb = await runDu(instance, ['/home/vercel-sandbox']);
  if (Number.isFinite(homeKb)) {
    logger.info(
      { sandboxId, ctxId, homeKb },
      'Sandbox /home/vercel-sandbox size (KB) before snapshot'
    );
  }
}

async function runDu(
  instance: Sandbox,
  args: string[]
): Promise<number | null> {
  const result = await instance
    .runCommand({ cmd: 'du', args: ['-sk', ...args] })
    .catch(() => null);
  if (!result) {
    return null;
  }

  const stdout = await result.stdout();
  const first = stdout.split('\t')[0] ?? '';
  const value = Number.parseInt(first, 10);
  return Number.isFinite(value) ? value : null;
}
