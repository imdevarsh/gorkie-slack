import { Snapshot } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import {
  addSnapIndex,
  listExpiredSnapIndex,
  removeSnapIndex,
  removeSnapIndexRaw,
  setSnap,
} from './queries';

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
  const expired = await listExpiredSnapIndex(cutoff);

  if (expired.length === 0) {
    return;
  }

  await Promise.all(
    expired.map(async (entry) => {
      const [snapshotId, ctxId] = entry.split(':');
      if (!(snapshotId && ctxId)) {
        await removeSnapIndexRaw(entry);
        return;
      }

      await deleteSnapshot(snapshotId, ctxId);
      await removeSnapIndex(snapshotId, ctxId);
    })
  );
}

export async function registerSnapshot(
  ctxId: string,
  snapshotId: string
): Promise<void> {
  const now = Date.now();
  await setSnap(ctxId, { snapshotId, createdAt: now });
  await addSnapIndex(snapshotId, ctxId, now);
}
