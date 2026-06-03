import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, notInArray } from 'drizzle-orm';
import { db } from '../index';
import {
  type NewSandboxSession,
  type SandboxSession,
  sandboxSessions,
  sandboxTokens,
} from '../schema';

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;

function hashSandboxToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
      ...(status === 'paused' && { pausedAt: new Date() }),
      ...(status === 'active' && { resumedAt: new Date() }),
      ...(status === 'destroyed' && { destroyedAt: new Date() }),
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
      ...(runtime.status === 'active' && { resumedAt: new Date() }),
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

export function listExpired(
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
        notInArray(sandboxSessions.status, ['destroyed', 'deleting']),
        isNull(sandboxSessions.destroyedAt),
        lt(sandboxSessions.updatedAt, cutoff)
      )
    )
    .limit(limit);
}

export async function claimExpired(threadId: string): Promise<boolean> {
  const rows = await db
    .update(sandboxSessions)
    .set({
      status: 'deleting',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sandboxSessions.threadId, threadId),
        notInArray(sandboxSessions.status, ['destroyed', 'deleting']),
        isNull(sandboxSessions.destroyedAt)
      )
    )
    .returning({
      threadId: sandboxSessions.threadId,
    });

  return rows.length > 0;
}

export async function issueSandboxToken({
  allowedIp,
  sandboxId,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
}: {
  allowedIp?: string | null;
  sandboxId: string;
  ttlMs?: number;
}): Promise<{ expiresAt: Date; token: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.insert(sandboxTokens).values({
    allowedIp,
    token: hashSandboxToken(token),
    sandboxId,
    expiresAt,
  });

  return { expiresAt, token };
}

export async function validateSandboxToken({
  requestIp,
  token,
}: {
  requestIp?: string | null;
  token: string;
}): Promise<{ sandboxId: string } | null> {
  const rows = await db
    .select({
      allowedIp: sandboxTokens.allowedIp,
      sandboxId: sandboxTokens.sandboxId,
    })
    .from(sandboxTokens)
    .where(
      and(
        eq(sandboxTokens.token, hashSandboxToken(token)),
        gt(sandboxTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.allowedIp && row.allowedIp !== requestIp) {
    return null;
  }

  return { sandboxId: row.sandboxId };
}

export async function revokeSandboxToken({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<void> {
  await db.delete(sandboxTokens).where(eq(sandboxTokens.sandboxId, sandboxId));
}

export async function deleteExpiredSandboxTokens(
  now = new Date()
): Promise<number> {
  const rows = await db
    .delete(sandboxTokens)
    .where(lt(sandboxTokens.expiresAt, now))
    .returning({ token: sandboxTokens.token });
  return rows.length;
}
