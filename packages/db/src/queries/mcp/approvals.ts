import { and, eq } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPToolApproval,
  type MCPToolApprovalStatus,
  mcpToolApprovals,
  type NewMCPToolApproval,
} from '../../schema';

type MCPToolApprovalUpdate = Partial<
  Pick<NewMCPToolApproval, 'messageTs' | 'status'>
>;

export async function createMCPToolApproval(approval: NewMCPToolApproval) {
  const rows = await db.insert(mcpToolApprovals).values(approval).returning();
  return rows[0] ?? null;
}

export function supersedePendingMCPToolApprovals({
  channelId,
  threadTs,
  userId,
}: {
  channelId: string;
  threadTs?: string | null;
  userId: string;
}) {
  return db
    .update(mcpToolApprovals)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(mcpToolApprovals.userId, userId),
        eq(mcpToolApprovals.channelId, channelId),
        eq(mcpToolApprovals.status, 'pending'),
        threadTs ? eq(mcpToolApprovals.threadTs, threadTs) : undefined
      )
    )
    .returning({
      channelId: mcpToolApprovals.channelId,
      messageTs: mcpToolApprovals.messageTs,
      serverId: mcpToolApprovals.serverId,
      toolName: mcpToolApprovals.toolName,
      userId: mcpToolApprovals.userId,
    });
}

export function getMCPToolApprovalStatus({
  approvalId,
  userId,
}: {
  approvalId: string;
  userId: string;
}): Promise<{
  serverId: string;
  status: MCPToolApprovalStatus;
  toolName: string;
  userId: string;
} | null> {
  return db
    .select({
      serverId: mcpToolApprovals.serverId,
      status: mcpToolApprovals.status,
      toolName: mcpToolApprovals.toolName,
      userId: mcpToolApprovals.userId,
    })
    .from(mcpToolApprovals)
    .where(
      and(
        eq(mcpToolApprovals.approvalId, approvalId),
        eq(mcpToolApprovals.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function claimMCPToolApproval({
  approvalId,
  userId,
}: {
  approvalId: string;
  userId: string;
}) {
  const rows = await db
    .update(mcpToolApprovals)
    .set({ status: 'handling', updatedAt: new Date() })
    .where(
      and(
        eq(mcpToolApprovals.approvalId, approvalId),
        eq(mcpToolApprovals.userId, userId),
        eq(mcpToolApprovals.status, 'pending')
      )
    )
    .returning();
  return rows[0] ?? null;
}

export async function updateMCPToolApproval({
  approvalId,
  userId,
  values,
}: {
  approvalId: string;
  userId: string;
  values: MCPToolApprovalUpdate;
}) {
  const rows = await db
    .update(mcpToolApprovals)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(mcpToolApprovals.approvalId, approvalId),
        eq(mcpToolApprovals.userId, userId)
      )
    )
    .returning();
  return rows[0] ?? null;
}

const OPEN_APPROVAL_STATUSES = new Set(['pending', 'handling']);

export function finalizeMCPToolApprovalInBatch({
  approvalId,
  status,
  userId,
}: {
  approvalId: string;
  status: 'approved' | 'denied';
  userId: string;
}): Promise<
  | { batchComplete: false }
  | { batchComplete: true; siblings: MCPToolApproval[] }
> {
  return db.transaction(async (tx) => {
    const current = await tx
      .select({
        channelId: mcpToolApprovals.channelId,
        eventTs: mcpToolApprovals.eventTs,
        threadTs: mcpToolApprovals.threadTs,
      })
      .from(mcpToolApprovals)
      .where(
        and(
          eq(mcpToolApprovals.approvalId, approvalId),
          eq(mcpToolApprovals.userId, userId)
        )
      )
      .limit(1);
    const key = current[0];
    if (!key) {
      return { batchComplete: false };
    }

    const siblings = await tx
      .select()
      .from(mcpToolApprovals)
      .where(
        and(
          eq(mcpToolApprovals.userId, userId),
          eq(mcpToolApprovals.channelId, key.channelId),
          eq(mcpToolApprovals.threadTs, key.threadTs),
          eq(mcpToolApprovals.eventTs, key.eventTs)
        )
      )
      .orderBy(mcpToolApprovals.id)
      .for('update');

    await tx
      .update(mcpToolApprovals)
      .set({ status, updatedAt: new Date() })
      .where(eq(mcpToolApprovals.approvalId, approvalId));

    const open = siblings.some(
      (sibling) =>
        sibling.approvalId !== approvalId &&
        OPEN_APPROVAL_STATUSES.has(sibling.status)
    );
    if (open) {
      return { batchComplete: false };
    }

    const settled = siblings.map((sibling) =>
      sibling.approvalId === approvalId ? { ...sibling, status } : sibling
    );
    return { batchComplete: true, siblings: settled };
  });
}
