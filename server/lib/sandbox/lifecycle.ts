import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { snapshotRecordSchema } from '~/lib/validators/sandbox/snapshot';
import type { SlackMessageContext } from '~/types';
import { safeParseJson } from '~/utils/parse-json';
import { syncAttachments } from './attachments';
import { installTools, makeFolders } from './bootstrap';
import { cleanupSnapshots, deleteSnapshot, registerSnapshot } from './snapshot';
import type { SandboxAttachments } from './types';

export async function getSandbox(
  ctxId: string,
  context?: SlackMessageContext,
  attachments?: SandboxAttachments
): Promise<Sandbox> {
  const live = await reconnectSandbox(ctxId);
  if (live) {
    await syncAttachments(live, ctxId, attachments);
    return live;
  }

  const instance = await provision(ctxId, context);
  await syncAttachments(instance, ctxId, attachments);
  await redis.set(redisKeys.sandbox(ctxId), instance.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
  return instance;
}

export async function stopSandbox(ctxId: string): Promise<void> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return;
  }

  await redis.del(redisKeys.sandbox(ctxId));

  const snapshotRaw = await redis.get(redisKeys.snapshot(ctxId));
  const previousSnapshotId =
    safeParseJson(snapshotRaw, snapshotRecordSchema)?.snapshotId ?? null;

  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (!instance || instance.status !== 'running') {
    return;
  }

  cleanupSnapshots().catch((error) => {
    logger.warn({ error, ctxId }, 'Failed to cleanup snapshots');
  });

  const snap = await instance.snapshot().catch(() => null);
  if (!snap) {
    await forceStop(sandboxId);
    return;
  }

  if (previousSnapshotId && previousSnapshotId !== snap.snapshotId) {
    await deleteSnapshot(previousSnapshotId, ctxId);
  }

  await registerSnapshot(ctxId, snap.snapshotId);
}

export async function reconnectSandbox(ctxId: string): Promise<Sandbox | null> {
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

async function provision(
  ctxId: string,
  context?: SlackMessageContext
): Promise<Sandbox> {
  const restored = await restore(ctxId, context);
  if (restored) {
    await installTools(restored);
    return restored;
  }

  if (context) {
    await setStatus(context, {
      status: 'is setting up the sandbox',
      loading: true,
    });
  }

  const instance = await Sandbox.create({
    runtime: config.runtime,
    timeout: config.timeoutMs,
  });

  await makeFolders(instance);
  await installTools(instance);

  logger.info({ ctxId, sandboxId: instance.sandboxId }, 'Created new sandbox');
  return instance;
}

async function restore(
  ctxId: string,
  context?: SlackMessageContext
): Promise<Sandbox | null> {
  const snapshotRaw = await redis.get(redisKeys.snapshot(ctxId));
  const snapshot = safeParseJson(snapshotRaw, snapshotRecordSchema);
  if (!snapshot) {
    return null;
  }

  const { snapshotId, createdAt } = snapshot;

  if (Date.now() - createdAt > config.snapshot.ttl * 1000) {
    await deleteSnapshot(snapshotId, ctxId);
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  if (context) {
    await setStatus(context, {
      status: 'is restoring the sandbox',
      loading: true,
    });
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
    'Restored sandbox from snapshot'
  );
  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}
