import { and, asc, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  type NewScheduledTask,
  type ScheduledTask,
  scheduledTasks,
} from '../schema';

// A run claim older than this is assumed orphaned by a crashed process and
// becomes reclaimable. Must comfortably exceed the longest legitimate task run
// (agent stream + Slack delivery).
const STALE_RUN_CLAIM_MS = 30 * 60 * 1000;

export async function createScheduledTask(task: NewScheduledTask) {
  const rows = await db.insert(scheduledTasks).values(task).returning();
  return rows[0] ?? null;
}

export async function countEnabledScheduledTasksByUser(userId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.creatorUserId, userId),
        eq(scheduledTasks.enabled, true)
      )
    );

  return Number(rows[0]?.count ?? 0);
}

export function listScheduledTasksByUser(
  userId: string,
  opts?: {
    includeDisabled?: boolean;
    limit?: number;
  }
) {
  const includeDisabled = opts?.includeDisabled ?? false;
  const limit = opts?.limit ?? 20;
  return db
    .select()
    .from(scheduledTasks)
    .where(
      includeDisabled
        ? eq(scheduledTasks.creatorUserId, userId)
        : and(
            eq(scheduledTasks.creatorUserId, userId),
            eq(scheduledTasks.enabled, true)
          )
    )
    .orderBy(desc(scheduledTasks.createdAt))
    .limit(limit);
}

export function listDueScheduledTasks(now: Date, limit = 20) {
  return db
    .select()
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.enabled, true),
        or(
          isNull(scheduledTasks.runningAt),
          lt(
            scheduledTasks.runningAt,
            new Date(now.getTime() - STALE_RUN_CLAIM_MS)
          )
        ),
        lte(scheduledTasks.nextRunAt, now)
      )
    )
    .orderBy(asc(scheduledTasks.nextRunAt))
    .limit(limit);
}

export async function claimScheduledTaskRun(taskId: string, now: Date) {
  const rows = await db
    .update(scheduledTasks)
    .set({
      runningAt: now,
      lastStatus: 'running',
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduledTasks.id, taskId),
        eq(scheduledTasks.enabled, true),
        or(
          isNull(scheduledTasks.runningAt),
          lt(
            scheduledTasks.runningAt,
            new Date(now.getTime() - STALE_RUN_CLAIM_MS)
          )
        ),
        lte(scheduledTasks.nextRunAt, now)
      )
    )
    .returning();

  return rows[0] ?? null;
}

export async function completeScheduledTaskRun(
  taskId: string,
  opts: {
    nextRunAt: Date;
    status: 'success' | 'error';
    error?: string;
    runAt?: Date;
  }
): Promise<void> {
  const runAt = opts.runAt ?? new Date();
  await db
    .update(scheduledTasks)
    .set({
      nextRunAt: opts.nextRunAt,
      lastRunAt: runAt,
      runningAt: null,
      lastStatus: opts.status,
      lastError: opts.error ?? null,
      updatedAt: runAt,
    })
    .where(eq(scheduledTasks.id, taskId));
}

export async function disableScheduledTask(
  taskId: string,
  error: string
): Promise<void> {
  const now = new Date();
  await db
    .update(scheduledTasks)
    .set({
      enabled: false,
      runningAt: null,
      lastStatus: 'error',
      lastError: error,
      updatedAt: now,
      lastRunAt: now,
    })
    .where(eq(scheduledTasks.id, taskId));
}

export async function cancelScheduledTaskForUser(
  taskId: string,
  userId: string
) {
  const now = new Date();
  const rows = await db
    .update(scheduledTasks)
    .set({
      enabled: false,
      runningAt: null,
      lastStatus: 'cancelled',
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduledTasks.id, taskId),
        eq(scheduledTasks.creatorUserId, userId),
        eq(scheduledTasks.enabled, true)
      )
    )
    .returning();

  return rows[0] ?? null;
}

export function getScheduledTaskByIdForUser(taskId: string, userId: string) {
  return db
    .select()
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.id, taskId),
        eq(scheduledTasks.creatorUserId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export function getScheduledTaskById(
  taskId: string
): Promise<ScheduledTask | null> {
  return db
    .select()
    .from(scheduledTasks)
    .where(eq(scheduledTasks.id, taskId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}
