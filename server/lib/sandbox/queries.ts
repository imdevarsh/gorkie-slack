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

const BASE_SNAP_KEY = 'gorkie:sandbox:baseSnapshot';

export async function getLiveId(ctxId: string): Promise<string | null> {
  return (await redis.get(redisKeys.sandbox(ctxId))) ?? null;
}

export async function setLiveId(
  ctxId: string,
  sandboxId: string
): Promise<void> {
  await redis.set(redisKeys.sandbox(ctxId), sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), config.ttl);
}

export async function clearLiveId(ctxId: string): Promise<void> {
  await redis.del(redisKeys.sandbox(ctxId));
}

export async function getSnap(ctxId: string): Promise<SnapshotRecord | null> {
  const raw = await redis.get(redisKeys.snapshot(ctxId));
  if (!raw) {
    return null;
  }

  return safeParseJson(raw, snapshotRecordSchema);
}

export async function setSnap(
  ctxId: string,
  snapshot: SnapshotRecord
): Promise<void> {
  await redis.set(redisKeys.snapshot(ctxId), JSON.stringify(snapshot));
  await redis.expire(redisKeys.snapshot(ctxId), config.snapshot.ttl);
}

export async function clearSnap(ctxId: string): Promise<void> {
  await redis.del(redisKeys.snapshot(ctxId));
}

export async function addSnapIndex(
  snapshotId: string,
  ctxId: string,
  createdAt: number
): Promise<void> {
  await redis.zadd(
    redisKeys.snapshotIndex(),
    createdAt,
    `${snapshotId}:${ctxId}`
  );
}

export async function removeSnapIndex(
  snapshotId: string,
  ctxId: string
): Promise<void> {
  await redis.zrem(redisKeys.snapshotIndex(), `${snapshotId}:${ctxId}`);
}

export async function removeSnapIndexRaw(entry: string): Promise<void> {
  await redis.zrem(redisKeys.snapshotIndex(), entry);
}

export async function listExpiredSnapIndex(cutoff: number): Promise<string[]> {
  return await redis.zrangebyscore(redisKeys.snapshotIndex(), 0, cutoff);
}

export async function getBaseSnap(): Promise<BaseSnapshotRecord | null> {
  const raw = await redis.get(BASE_SNAP_KEY);
  if (!raw) {
    return null;
  }

  return safeParseJson(raw, baseSnapshotRecordSchema);
}

export async function setBaseSnap(snapshot: BaseSnapshotRecord): Promise<void> {
  await redis.set(BASE_SNAP_KEY, JSON.stringify(snapshot));
}
