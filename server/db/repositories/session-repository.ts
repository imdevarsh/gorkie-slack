import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '~/db/client';
import { discordSessions } from '~/db/schema';
import type {
  RuntimeSessionStatus,
  ThreadSessionInput,
  ThreadSessionRecord,
} from '~/lib/runtime/types';

function toRecord(
  row: typeof discordSessions.$inferSelect
): ThreadSessionRecord {
  return {
    threadSessionKey: row.threadId,
    channelId: row.channelId,
    workspaceId: row.workspaceId,
    sandboxId: row.sandboxId,
    runtimeSessionId: row.sessionId,
    previewUrl: row.previewUrl,
    previewAccessToken: row.previewToken,
    status: row.status,
    lastError: row.lastError,
    resumeFailureCount: row.resumeFailCount,
  };
}

export async function upsertThreadSession(
  input: ThreadSessionInput
): Promise<ThreadSessionRecord> {
  await db
    .insert(discordSessions)
    .values({
      threadId: input.threadSessionKey,
      channelId: input.channelId,
      workspaceId: input.workspaceId,
      sandboxId: input.sandboxId,
      sessionId: input.runtimeSessionId,
      previewUrl: input.previewUrl,
      previewToken: input.previewAccessToken,
      status: input.status,
      lastError: input.lastError ?? null,
    })
    .onConflictDoUpdate({
      target: discordSessions.threadId,
      set: {
        channelId: input.channelId,
        workspaceId: input.workspaceId,
        sandboxId: input.sandboxId,
        sessionId: input.runtimeSessionId,
        previewUrl: input.previewUrl,
        previewToken: input.previewAccessToken,
        status: input.status,
        lastError: input.lastError ?? null,
        updatedAt: sql`NOW()`,
        lastActivity: sql`NOW()`,
      },
    });

  const saved = await getThreadSession(input.threadSessionKey);
  if (!saved) {
    throw new Error('Failed to load saved thread session');
  }
  return saved;
}

export async function getThreadSession(
  threadSessionKey: string
): Promise<ThreadSessionRecord | null> {
  const [row] = await db
    .select()
    .from(discordSessions)
    .where(eq(discordSessions.threadId, threadSessionKey))
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function markThreadActivity(
  threadSessionKey: string
): Promise<void> {
  await db
    .update(discordSessions)
    .set({
      lastActivity: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(discordSessions.threadId, threadSessionKey));
}

export async function updateThreadStatus(
  threadSessionKey: string,
  status: RuntimeSessionStatus,
  lastError?: string | null
): Promise<void> {
  await db
    .update(discordSessions)
    .set({
      status,
      lastError: lastError ?? null,
      pauseRequestedAt: status === 'pausing' ? sql`NOW()` : undefined,
      pausedAt: status === 'paused' ? sql`NOW()` : undefined,
      resumeAttemptedAt: status === 'resuming' ? sql`NOW()` : undefined,
      resumedAt: status === 'active' ? sql`NOW()` : undefined,
      destroyedAt: status === 'destroyed' ? sql`NOW()` : undefined,
      updatedAt: sql`NOW()`,
    })
    .where(eq(discordSessions.threadId, threadSessionKey));
}

export async function incrementResumeFailure(
  threadSessionKey: string,
  lastError: string
): Promise<void> {
  await db
    .update(discordSessions)
    .set({
      resumeFailCount: sql`${discordSessions.resumeFailCount} + 1`,
      lastError,
      updatedAt: sql`NOW()`,
    })
    .where(eq(discordSessions.threadId, threadSessionKey));
}

export async function markThreadHealthOk(
  threadSessionKey: string
): Promise<void> {
  await db
    .update(discordSessions)
    .set({
      lastHealthOkAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(discordSessions.threadId, threadSessionKey));
}

export async function listSessionsByStatus(
  status: RuntimeSessionStatus
): Promise<ThreadSessionRecord[]> {
  const rows = await db
    .select()
    .from(discordSessions)
    .where(eq(discordSessions.status, status));
  return rows.map(toRecord);
}

export async function listStaleActiveSessions(
  staleMinutes: number
): Promise<ThreadSessionRecord[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const rows = await db
    .select()
    .from(discordSessions)
    .where(
      and(
        eq(discordSessions.status, 'active'),
        lt(discordSessions.lastActivity, cutoff)
      )
    );
  return rows.map(toRecord);
}

export async function listExpiredPausedSessions(
  pausedTtlMinutes: number
): Promise<ThreadSessionRecord[]> {
  const cutoff = new Date(Date.now() - pausedTtlMinutes * 60 * 1000);
  const rows = await db
    .select()
    .from(discordSessions)
    .where(
      and(
        eq(discordSessions.status, 'paused'),
        lt(discordSessions.pausedAt, cutoff)
      )
    );
  return rows.map(toRecord);
}
