import { eq } from 'drizzle-orm';
import { db } from '../client';
import {
  type NewSandboxSession,
  type SandboxSession,
  type SandboxStatus,
  sandboxSessions,
} from '../schema';

function statusTimestamps(status?: SandboxStatus) {
  if (status === 'paused') {
    return { pausedAt: new Date() };
  }
  if (status === 'active') {
    return { resumedAt: new Date() };
  }
  return {};
}

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

export async function deleteByThread(threadId: string): Promise<void> {
  await db
    .delete(sandboxSessions)
    .where(eq(sandboxSessions.threadId, threadId));
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
        resumeState: session.resumeState ?? null,
        status: session.status,
        pausedAt: session.pausedAt ?? null,
        resumedAt: session.resumedAt ?? null,
        destroyedAt: session.destroyedAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function markActivity(threadId: string): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({ updatedAt: new Date() })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function markPaused(threadId: string): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({ status: 'paused', pausedAt: new Date() })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function updateRuntime(
  threadId: string,
  runtime: {
    resumeState?: string | null;
    sandboxId: string;
    sessionId: string;
    status?: SandboxStatus;
  }
): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      sandboxId: runtime.sandboxId,
      sessionId: runtime.sessionId,
      ...(runtime.resumeState === undefined
        ? {}
        : { resumeState: runtime.resumeState }),
      ...(runtime.status ? { status: runtime.status } : {}),
      ...statusTimestamps(runtime.status),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}

export async function updateResumeState({
  resumeState,
  session,
  status,
  threadId,
}: {
  resumeState: string | null;
  session?: { data: string; file: string };
  status?: SandboxStatus;
  threadId: string;
}): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      resumeState,
      ...(session === undefined ? {} : { session }),
      ...(status ? { status } : {}),
      ...statusTimestamps(status),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}
