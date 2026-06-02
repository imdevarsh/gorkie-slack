import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  type AskUserFlowRecord,
  askUserFlows,
  type NewAskUserFlowRecord,
} from '../schema';

export async function createAskUserFlowRecord(flow: NewAskUserFlowRecord) {
  const rows = await db.insert(askUserFlows).values(flow).returning();
  return rows[0] ?? null;
}

export function getAskUserFlowRecord({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<AskUserFlowRecord | null> {
  return db
    .select()
    .from(askUserFlows)
    .where(and(eq(askUserFlows.id, id), eq(askUserFlows.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function updateAskUserFlowRecord({
  id,
  userId,
  values,
}: {
  id: string;
  userId: string;
  values: Partial<NewAskUserFlowRecord>;
}) {
  const rows = await db
    .update(askUserFlows)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(askUserFlows.id, id), eq(askUserFlows.userId, userId)))
    .returning();
  return rows[0] ?? null;
}
