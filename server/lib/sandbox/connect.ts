import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import {
  clearSandboxId,
  clearSnapshotRaw,
  getSandboxId,
  getSnapshotRaw,
} from './queries';
import { deleteSnapshot, parseSnapshotRecord } from './snapshot';

export async function reconnectSandbox(ctxId: string): Promise<Sandbox | null> {
  const sandboxId = await getSandboxId(ctxId);
  if (!sandboxId) {
    return null;
  }

  const existing = await Sandbox.get({ sandboxId }).catch(() => null);
  if (existing?.status === 'running') {
    return existing;
  }

  await clearSandboxId(ctxId);
  return null;
}

export async function restoreSandbox(ctxId: string): Promise<Sandbox | null> {
  const snapshotRaw = await getSnapshotRaw(ctxId);
  if (!snapshotRaw) {
    return null;
  }

  const parsed = parseSnapshotRecord(snapshotRaw);
  const snapshotId = parsed?.snapshotId ?? null;
  const createdAt = parsed?.createdAt ?? Number.NaN;

  if (!(snapshotId && Number.isFinite(createdAt))) {
    await clearSnapshotRaw(ctxId);
    return null;
  }

  const isExpired = Date.now() - createdAt > config.snapshot.ttl * 1000;
  if (isExpired) {
    await deleteSnapshot(snapshotId, ctxId);
    await clearSnapshotRaw(ctxId);
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
    await clearSnapshotRaw(ctxId);
    return null;
  }

  logger.info(
    { snapshotId, sandboxId: instance.sandboxId, ctxId },
    'Restored from snapshot'
  );
  return instance;
}
