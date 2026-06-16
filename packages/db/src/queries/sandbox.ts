import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  type NewSandboxSession,
  type SandboxSession,
  sandboxSessions,
} from '../schema';

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

export async function updateRuntime(
  threadId: string,
  runtime: {
    resumeState?: string | null;
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
      ...(runtime.resumeState === undefined
        ? {}
        : { resumeState: runtime.resumeState }),
      ...(runtime.status ? { status: runtime.status } : {}),
      ...(runtime.status === 'active' && { resumedAt: new Date() }),
      updatedAt: new Date(),
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
  status?: string;
  threadId: string;
}): Promise<void> {
  await db
    .update(sandboxSessions)
    .set({
      resumeState,
      ...(session === undefined ? {} : { session }),
      ...(status ? { status } : {}),
      ...(status === 'paused' && { pausedAt: new Date() }),
      ...(status === 'active' && { resumedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(sandboxSessions.threadId, threadId));
}
