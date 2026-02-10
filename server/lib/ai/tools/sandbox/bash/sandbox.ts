import { Sandbox, Snapshot } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';
import { transportAttachments } from './attachments';
import { installUtils, makeFolders } from './bootstrap';

const SNAPSHOT_INDEX_SEPARATOR = ':';

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

async function cleanupExpiredSnapshots(): Promise<void> {
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
  await redis.expire(redisKeys.sandbox(ctxId), config.sandbox.ttl);

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
  const result = await instance.runCommand({ cmd: 'ls', args: ['-1'] });
  const stdout = await result.stdout();
  const entries = stdout.split('\n').filter(Boolean);
  const keep = new Set<string>(config.keep);
  const toRemove = entries.filter((entry) => !keep.has(entry));

  if (toRemove.length === 0) {
    return;
  }

  await instance
    .runCommand({ cmd: 'rm', args: ['-rf', ...toRemove] })
    .catch((error: unknown) => {
      logger.warn({ error, ctxId }, 'Sandbox prune failed');
    });
}

async function deleteSnapshot(
  snapshotId: string,
  ctxId: string
): Promise<void> {
  try {
    const snapshot = await Snapshot.get({
      snapshotId,
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

  await cleanupExpiredSnapshots();

  const sizeResult = await instance
    .runCommand({
      cmd: 'du',
      args: [
        '-sk',
        '/',
        '--exclude=/proc',
        '--exclude=/sys',
        '--exclude=/dev',
        '--exclude=/run',
      ],
    })
    .catch(() => null);
  const sizeStdout = sizeResult ? await sizeResult.stdout() : '';
  const totalKb = Number.parseInt(sizeStdout.split('\t')[0] ?? '', 10);
  if (Number.isFinite(totalKb)) {
    logger.info(
      { sandboxId, ctxId, totalKb },
      'Sandbox size (KB) before snapshot'
    );
  }

  const homeResult = await instance
    .runCommand({
      cmd: 'du',
      args: ['-sk', '/home/vercel-sandbox'],
    })
    .catch(() => null);
  const homeStdout = homeResult ? await homeResult.stdout() : '';
  const homeKb = Number.parseInt(homeStdout.split('\t')[0] ?? '', 10);
  if (Number.isFinite(homeKb)) {
    logger.info(
      { sandboxId, ctxId, homeKb },
      'Sandbox /home/vercel-sandbox size (KB) before snapshot'
    );
  }

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
  await redis.set(redisKeys.snapshotMeta(ctxId), Date.now().toString());
  await Promise.all([
    redis.expire(redisKeys.snapshot(ctxId), config.snapshot.ttl),
    redis.expire(redisKeys.snapshotMeta(ctxId), config.snapshot.ttl),
  ]);
  await redis.zadd(
    redisKeys.snapshotIndex(),
    Date.now(),
    `${snap.snapshotId}${SNAPSHOT_INDEX_SEPARATOR}${ctxId}`
  );

  logger.info(
    { sandboxId, snapshotId: snap.snapshotId, ctxId },
    'Snapshot saved'
  );
}
