import { Sandbox } from '@vercel/sandbox';
import { z } from 'zod';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { transportAttachments } from './attachments';
import { installUtils, makeFolders } from './bootstrap';
import { cleanupSnapshots, deleteSnapshot, registerSnapshot } from './snapshot';

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
  const [snapshotId, snapshotMeta] = await Promise.all([
    redis.get(redisKeys.snapshot(ctxId)),
    redis.get(redisKeys.snapshotMeta(ctxId)),
  ]);
  if (!snapshotId) {
    return null;
  }

  const createdAt = snapshotMeta ? Number(snapshotMeta) : Number.NaN;
  if (!Number.isFinite(createdAt)) {
    await redis.del(redisKeys.snapshot(ctxId));
    await redis.del(redisKeys.snapshotMeta(ctxId));
    return null;
  }

  const isExpired = Date.now() - createdAt > config.snapshot.ttl * 1000;
  if (isExpired) {
    await deleteSnapshot(snapshotId, ctxId);
    await redis.del(redisKeys.snapshot(ctxId));
    await redis.del(redisKeys.snapshotMeta(ctxId));
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

export const historyEntrySchema = z.object({
  command: z.string(),
  workdir: z.string(),
  status: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});

export const historySchema = z.array(historyEntrySchema);

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export async function getOrCreate(
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
    await setStatus(context, { status: 'is restoring sandbox', loading: true });
  }

  const restored = await restoreFromSnapshot(ctxId);

  let instance: Sandbox;
  if (restored) {
    instance = restored;
    await installUtils(instance);
  } else {
    if (context) {
      await setStatus(context, {
        status: 'is setting up sandbox',
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

export async function snapshotAndStop(ctxId: string): Promise<void> {
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
