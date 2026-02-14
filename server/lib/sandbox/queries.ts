import { sandbox as config } from '~/config';
import { redis, redisKeys } from '~/lib/kv';
import type {
  BaseSnapshotRecord,
  SnapshotRecord,
} from '~/lib/validators/sandbox/snapshot';
import {
  baseSnapshotRecordSchema,
  snapshotRecordSchema,
} from '~/lib/validators/sandbox/snapshot';
import { safeParseJson } from '~/utils/parse-json';

const BASE_KEY = 'gorkie:sandbox:baseSnapshot';

export interface State {
  sandboxId: string | null;
  snapshot: SnapshotRecord | null;
}

export async function getState(ctxId: string): Promise<State> {
  const [sandboxId, snapshotRaw] = await Promise.all([
    redis.get(redisKeys.sandbox(ctxId)),
    redis.get(redisKeys.snapshot(ctxId)),
  ]);

  return {
    sandboxId: sandboxId ?? null,
    snapshot: snapshotRaw
      ? safeParseJson(snapshotRaw, snapshotRecordSchema)
      : null,
  };
}

export async function setSandboxId(
  ctxId: string,
  sandboxId: string
): Promise<void> {
  await redis.set(redisKeys.sandbox(ctxId), sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
}

export async function clearSandbox(ctxId: string): Promise<void> {
  await redis.del(redisKeys.sandbox(ctxId));
}

export async function putSnapshot(
  ctxId: string,
  snapshotId: string,
  createdAt: number
): Promise<void> {
  await redis.set(
    redisKeys.snapshot(ctxId),
    JSON.stringify({ snapshotId, createdAt })
  );
  await redis.expire(redisKeys.snapshot(ctxId), config.snapshot.ttl);
  await redis.zadd(
    redisKeys.snapshotIndex(),
    createdAt,
    `${snapshotId}:${ctxId}`
  );
}

export async function clearSnapshot(ctxId: string): Promise<void> {
  await redis.del(redisKeys.snapshot(ctxId));
}

export async function listExpiredSnapshotIndex(
  cutoff: number
): Promise<string[]> {
  return await redis.zrangebyscore(redisKeys.snapshotIndex(), 0, cutoff);
}

export async function removeSnapshotIndex(
  snapshotId: string,
  ctxId: string
): Promise<void> {
  await redis.zrem(redisKeys.snapshotIndex(), `${snapshotId}:${ctxId}`);
}

export async function removeSnapshotIndexRaw(entry: string): Promise<void> {
  await redis.zrem(redisKeys.snapshotIndex(), entry);
}

export async function getBase(): Promise<BaseSnapshotRecord | null> {
  const raw = await redis.get(BASE_KEY);
  if (!raw) {
    return null;
  }

  return safeParseJson(raw, baseSnapshotRecordSchema);
}

export async function setBase(snapshot: BaseSnapshotRecord): Promise<void> {
  await redis.set(BASE_KEY, JSON.stringify(snapshot));
}
