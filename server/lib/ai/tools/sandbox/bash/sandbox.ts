import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { snapshotRecordSchema } from '~/lib/validators/sandbox/snapshot';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { transportAttachments } from './attachments';
import { installUtils, makeFolders } from './bootstrap';
import {
  cleanupSnapshots,
  deleteSnapshot,
  registerSnapshot,
} from './utils/snapshot';

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
  const snapshotRaw = await redis.get(redisKeys.snapshot(ctxId));
  if (!snapshotRaw) {
    return null;
  }

  let snapshotId: string | null = null;
  let createdAt = Number.NaN;
  try {
    const parsed = snapshotRecordSchema.parse(
      JSON.parse(snapshotRaw) as unknown
    );
    snapshotId = parsed.snapshotId;
    createdAt = parsed.createdAt;
  } catch {
    snapshotId = null;
  }

  if (!(snapshotId && Number.isFinite(createdAt))) {
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  const isExpired = Date.now() - createdAt > config.snapshot.ttl * 1000;
  if (isExpired) {
    await deleteSnapshot(snapshotId, ctxId);
    await redis.del(redisKeys.snapshot(ctxId));
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

export interface SandboxAttachments {
  files: SlackFile[];
  messageTs: string;
}

export async function getSandbox(
  ctxId: string,
  context?: SlackMessageContext,
  attachments?: SandboxAttachments
): Promise<Sandbox> {
  const live = await reconnect(ctxId);
  if (live) {
    if (attachments?.files.length) {
      await transportAttachments(
        live,
        attachments.messageTs,
        attachments.files
      );
    }
    return live;
  }

  if (context) {
    await setStatus(context, {
      status: 'is restoring the sandbox',
      loading: true,
    });
  }

  const restored = await restoreFromSnapshot(ctxId);

  let instance: Sandbox;
  if (restored) {
    instance = restored;
    await installUtils(instance);
  } else {
    if (context) {
      await setStatus(context, {
        status: 'is setting up the sandbox',
        loading: true,
      });
    }

    instance = await Sandbox.create({
      runtime: config.runtime,
      timeout: config.timeoutMs,
    });

    await makeFolders(instance);
    await installUtils(instance);

    logger.info({ sandboxId: instance.sandboxId, ctxId }, 'Created sandbox');
  }

  if (attachments?.files.length) {
    await transportAttachments(
      instance,
      attachments.messageTs,
      attachments.files
    );
  }

  await redis.set(redisKeys.sandbox(ctxId), instance.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);

  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}

export async function stopSandbox(ctxId: string): Promise<void> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return;
  }

  await redis.del(redisKeys.sandbox(ctxId));
  const previousSnapshotId = await redis.get(redisKeys.snapshot(ctxId));

  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (!instance || instance.status !== 'running') {
    return;
  }

  await cleanupSnapshots();
  const snap = await instance.snapshot().catch((error: unknown) => {
    logger.warn({ sandboxId, error, ctxId }, 'Snapshot failed');
    return null;
  });

  if (!snap) {
    await forceStop(sandboxId);
    return;
  }

  if (previousSnapshotId && previousSnapshotId !== snap.snapshotId) {
    await deleteSnapshot(previousSnapshotId, ctxId);
  }

  await registerSnapshot(ctxId, snap.snapshotId);

  logger.info(
    { sandboxId, snapshotId: snap.snapshotId, ctxId },
    'Snapshot saved'
  );
}
