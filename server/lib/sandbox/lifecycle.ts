import type { Sandbox } from 'modal';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import { snapshotRecordSchema } from '~/lib/validators/sandbox/snapshot';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { safeParseJson } from '~/utils/parse-json';
import { installTools, makeFolders } from './bootstrap';
import {
  createModalSandbox,
  getModalSandboxById,
  snapshotSandboxFilesystem,
  terminateModalSandbox,
} from './modal';
import { cleanupSnapshots, deleteSnapshot, registerSnapshot } from './snapshot';

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const ctxId = getContextId(context);
  const existing = await reconnectSandbox(ctxId);
  if (existing) {
    return existing;
  }

  const sandbox = await provisionSandbox(context);
  await redis.set(redisKeys.sandbox(ctxId), sandbox.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
  return sandbox;
}

export async function stopSandbox(ctxId: string): Promise<void> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return;
  }

  await redis.del(redisKeys.sandbox(ctxId));

  const snapshotRaw = await redis.get(redisKeys.snapshot(ctxId));
  const previousImageId =
    safeParseJson(snapshotRaw, snapshotRecordSchema)?.imageId ?? null;

  const sandbox = await getModalSandboxById(sandboxId);
  if (!sandbox) {
    return;
  }

  cleanupSnapshots().catch((error: unknown) => {
    logger.warn({ error, ctxId }, '[sandbox] Snapshot cleanup failed');
  });

  const imageId = await snapshotSandboxFilesystem(sandbox).catch(
    (error: unknown) => {
      logger.warn({ error, ctxId, sandboxId }, '[sandbox] Snapshot failed');
      return null;
    }
  );

  await terminateModalSandbox(sandbox).catch((error: unknown) => {
    logger.warn({ error, ctxId, sandboxId }, '[sandbox] Terminate failed');
  });

  if (!imageId) {
    return;
  }

  if (previousImageId && previousImageId !== imageId) {
    await deleteSnapshot(previousImageId, ctxId);
  }

  await registerSnapshot(ctxId, imageId);
}

export async function reconnectSandbox(ctxId: string): Promise<Sandbox | null> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return null;
  }

  const sandbox = await getModalSandboxById(sandboxId);
  if (sandbox) {
    return sandbox;
  }

  await redis.del(redisKeys.sandbox(ctxId));
  return null;
}

async function provisionSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const ctxId = getContextId(context);

  const restored = await restoreFromSnapshot(context);
  if (restored) {
    await makeFolders(restored);
    await installTools(restored);
    return restored;
  }

  await setStatus(context, {
    status: 'is setting up the sandbox',
    loading: true,
  });

  const sandbox = await createModalSandbox();
  await makeFolders(sandbox);
  await installTools(sandbox);

  logger.info(
    { ctxId, sandboxId: sandbox.sandboxId },
    '[sandbox] Created new Modal sandbox'
  );

  return sandbox;
}

async function restoreFromSnapshot(
  context: SlackMessageContext
): Promise<Sandbox | null> {
  const ctxId = getContextId(context);
  const snapshotRaw = await redis.get(redisKeys.snapshot(ctxId));
  const snapshot = safeParseJson(snapshotRaw, snapshotRecordSchema);
  if (!snapshot) {
    return null;
  }

  const { imageId, createdAt } = snapshot;
  const ageMs = Date.now() - createdAt;
  if (ageMs > config.snapshot.ttl * 1000) {
    await deleteSnapshot(imageId, ctxId);
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  await setStatus(context, {
    status: 'is restoring the sandbox',
    loading: true,
  });

  const sandbox = await createModalSandbox(imageId).catch((error: unknown) => {
    logger.warn(
      { imageId, error, ctxId },
      '[sandbox] Failed to restore Modal sandbox from image'
    );
    return null;
  });

  if (!sandbox) {
    await redis.del(redisKeys.snapshot(ctxId));
    return null;
  }

  logger.info(
    { imageId, sandboxId: sandbox.sandboxId, ctxId },
    '[sandbox] Restored Modal sandbox from image'
  );

  return sandbox;
}
