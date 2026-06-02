import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  type AskUserApproval,
  askUserApprovals,
  type NewAskUserApproval,
} from '../schema';

export async function createAskUserApproval(approval: NewAskUserApproval) {
  const rows = await db.insert(askUserApprovals).values(approval).returning();
  return rows[0] ?? null;
}

export function getAskUserApproval({
  approvalId,
  userId,
}: {
  approvalId: string;
  userId: string;
}): Promise<AskUserApproval | null> {
  return db
    .select()
    .from(askUserApprovals)
    .where(
      and(
        eq(askUserApprovals.approvalId, approvalId),
        eq(askUserApprovals.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function updateAskUserApproval({
  approvalId,
  userId,
  values,
}: {
  approvalId: string;
  userId: string;
  values: Partial<NewAskUserApproval>;
}) {
  const rows = await db
    .update(askUserApprovals)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(askUserApprovals.approvalId, approvalId),
        eq(askUserApprovals.userId, userId)
      )
    )
    .returning();
  return rows[0] ?? null;
}
