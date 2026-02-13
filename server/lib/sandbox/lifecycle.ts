import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { snapshotRecordSchema } from '~/lib/validators/sandbox/snapshot';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { safeParseJson } from '~/utils/parse-json';
import { installTools, makeFolders } from './bootstrap';
import { cleanupSnapshots, deleteSnapshot, registerSnapshot } from './snapshot';

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const ctxId = getContextId(context);
  const live = await reconnectSandbox(ctxId);
  if (live) {
    return live;
  }

  const instance = await provision(context);
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

  const instance = await Sandbox.get({ sandboxId, ...config.auth }).catch(
    () => null
  );
  if (!instance || instance.status !== 'running') {
    return;
  }

  cleanupSnapshots().catch((error) => {
    logger.warn({ error, ctxId }, '[sandbox] Snapshot cleanup failed');
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

  const existing = await Sandbox.get({ sandboxId, ...config.auth }).catch(
    () => null
  );
  if (existing?.status === 'running') {
    return existing;
  }

  await redis.del(redisKeys.sandbox(ctxId));
  return null;
}

async function provision(context: SlackMessageContext): Promise<Sandbox> {
  const ctxId = getContextId(context);
  const restored = await restore(context);
  if (restored) {
    await installTools(restored);
    return restored;
  }

  await setStatus(context, {
    status: 'is setting up the sandbox',
    loading: true,
  });

  const instance = await Sandbox.create({
    runtime: config.runtime,
    timeout: config.timeoutMs,
    ...config.auth,
  });

  await makeFolders(instance);
  await installTools(instance);

  logger.info(
    { ctxId, sandboxId: instance.sandboxId },
    '[sandbox] Created new sandbox'
  );
  return instance;
}

async function restore(context: SlackMessageContext): Promise<Sandbox | null> {
  const ctxId = getContextId(context);
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

  await setStatus(context, {
    status: 'is restoring the sandbox',
    loading: true,
  });

  const instance = await Sandbox.create({
    source: { type: 'snapshot', snapshotId },
    timeout: config.timeoutMs,
    ...config.auth,
  }).catch((error: unknown) => {
    logger.warn(
      { snapshotId, error, ctxId },
      '[sandbox] Failed to restore sandbox from snapshot'
    );
    return null;
  });

  if (!instance) {
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  logger.info(
    { snapshotId, sandboxId: instance.sandboxId, ctxId },
    '[sandbox] Restored sandbox from snapshot'
  );
  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId, ...config.auth }).catch(
    () => null
  );
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}
