import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '~/db';
import {
  type NewSandboxSession,
  type SandboxSession,
  sandboxSessions,
} from '~/db/schema';

export async function getByThread(
  threadId: string
): Promise<SandboxSession | null> {
  const rows = await db
    .select()
    .from(sandboxSessions)
    .where(eq(sandboxSessions.threadId, threadId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsert(session: NewSandboxSession): Promise<void> {
  await db
    .insert(sandboxSessions)
    .values(session)
    .onConflictDoUpdate({
      target: sandboxSessions.threadId,
      set: {
        channelId: session.channelId,
        sandboxId: session.sandboxId,
        status: session.status,
        lastError: session.lastError ?? null,
        pausedAt: session.pausedAt ?? null,
        resumedAt: session.resumedAt ?? null,
        destroyedAt: session.destroyedAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function updateStatus(
  threadId: string,
  status: string,
  lastError?: string | null
): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      status,
      ...(lastError !== undefined ? { lastError } : {}),
      pausedAt: status === 'paused' ? new Date() : null,
      resumedAt: status === 'active' ? new Date() : null,
      destroyedAt: status === 'destroyed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function markActivity(threadId: string): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function clearDestroyed(threadId: string): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      status: 'destroyed',
      destroyedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}

export function listPausedForAutoDelete(
  cutoff: Date,
  limit = 50
): Promise<Pick<SandboxSession, 'threadId' | 'sandboxId'>[]> {
  return db
    .select({
      threadId: sandboxSessions.threadId,
      sandboxId: sandboxSessions.sandboxId,
    })
    .from(sandboxSessions)
    .where(
      and(
        eq(sandboxSessions.status, 'paused'),
        isNull(sandboxSessions.destroyedAt),
        lt(sandboxSessions.updatedAt, cutoff)
      )
    )
    .limit(limit);
}

export async function claimPausedForAutoDelete(
  threadId: string
): Promise<boolean> {
  const rows = await db
    .update(sandboxSessions)
    .set({
      status: 'deleting',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sandboxSessions.threadId, threadId),
        eq(sandboxSessions.status, 'paused'),
        isNull(sandboxSessions.destroyedAt)
      )
    )
    .returning({
      threadId: sandboxSessions.threadId,
    });

  return rows.length > 0;
}
