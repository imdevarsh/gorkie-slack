import { Snapshot } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import * as redis from './queries';

export async function deleteSnapshot(
  snapshotId: string,
  ctxId: string
): Promise<void> {
  try {
    const snapshot = await Snapshot.get({ snapshotId, ...config.auth });
    await snapshot.delete();
    logger.info({ snapshotId, ctxId }, '[sandbox] Deleted snapshot');
  } catch (error) {
    logger.warn(
      { snapshotId, error, ctxId },
      '[sandbox] Failed to delete snapshot'
    );
  }
}

export async function cleanupSnapshots(): Promise<void> {
  const cutoff = Date.now() - config.snapshot.ttl * 1000;
  const expired = await redis.listExpiredSnapshotIndex(cutoff);

  if (expired.length === 0) {
    return;
  }

  await Promise.all(
    expired.map(async (entry) => {
      const [snapshotId, ctxId] = entry.split(':');
      if (!(snapshotId && ctxId)) {
        await redis.removeSnapshotIndexRaw(entry);
        return;
      }

      await deleteSnapshot(snapshotId, ctxId);
      await redis.removeSnapshotIndex(snapshotId, ctxId);
    })
  );
}
