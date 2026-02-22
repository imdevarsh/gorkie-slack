import { eq } from 'drizzle-orm';
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
        sandboxId: session.sandboxId,
        sessionId: session.sessionId,
        status: session.status,
        pausedAt: session.pausedAt ?? null,
        resumedAt: session.resumedAt ?? null,
        destroyedAt: session.destroyedAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function updateStatus(
  threadId: string,
  status: string
): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      status,
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
    .set({ updatedAt: new Date() })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function updateRuntime(
  threadId: string,
  runtime: {
    sandboxId: string;
    sessionId: string;
    status?: string;
  }
): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      sandboxId: runtime.sandboxId,
      sessionId: runtime.sessionId,
      ...(runtime.status ? { status: runtime.status } : {}),
      resumedAt: runtime.status === 'active' ? new Date() : undefined,
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
