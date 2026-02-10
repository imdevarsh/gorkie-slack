import { Sandbox, Snapshot } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { setStatus } from '~/lib/ai/utils/status';
import { transportAttachments } from './attachments';

async function setupDirs(instance: Sandbox): Promise<void> {
  await instance
    .runCommand({
      cmd: 'mkdir',
      args: ['-p', 'agent/turns', 'output'],
    })
    .catch((error: unknown) => {
      logger.warn({ error }, 'Sandbox dir setup failed');
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

export interface SandboxAttachments {
  files: SlackFile[];
  messageTs: string;
}

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

    await setupDirs(instance);

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
  await redis.expire(redisKeys.sandbox(ctxId), config.sandboxTtlSeconds);

  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}

async function pruneSandboxFiles(
  instance: Sandbox,
  ctxId: string
): Promise<void> {
  const keepPaths = config.keep;
  const keepMatchers = keepPaths
    .map((path) => `-name '${path}'`)
    .join(' -o ');
  const filter = keepMatchers ? `\\( ${keepMatchers} \\)` : '';

  await instance
    .runCommand({
      cmd: 'sh',
      args: [
        '-c',
        `find . -mindepth 1 -maxdepth 1 ${
          filter ? `! ${filter}` : ''
        } -exec rm -rf {} +`,
      ],
    })
    .catch((error: unknown) => {
      logger.warn({ error, ctxId }, 'Sandbox prune failed');
    });
}

async function deleteSnapshot(snapshotId: string, ctxId: string): Promise<void> {
  try {
    const snapshot = await Snapshot.get({
      snapshotId
    });
    await snapshot.delete();
    logger.info({ snapshotId, ctxId }, 'Deleted previous snapshot');
  } catch (error) {
    logger.warn({ snapshotId, error, ctxId }, 'Failed to delete snapshot');
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

  await pruneSandboxFiles(instance, ctxId);

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

  await redis.set(redisKeys.snapshot(ctxId), snap.snapshotId);
  await redis.expire(redisKeys.snapshot(ctxId), config.snapshotTtlSeconds);

  logger.info(
    { sandboxId, snapshotId: snap.snapshotId, ctxId },
    'Snapshot saved'
  );
}
