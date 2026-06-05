import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { db } from '../index';
import {
  type McpBearerConnection,
  type McpOauthConnection,
  type McpServer,
  type McpToolApproval,
  type McpToolPermission,
  mcpBearerConnections,
  mcpOauthConnections,
  mcpServers,
  mcpToolApprovals,
  mcpToolPermissions,
  type NewMcpBearerConnection,
  type NewMcpOauthConnection,
  type NewMcpServer,
  type NewMcpToolApproval,
  type NewMcpToolPermission,
} from '../schema';

export interface McpServerWithConnection extends McpServer {
  hasConnection: boolean;
}

export async function createMcpServer(server: NewMcpServer) {
  const rows = await db.insert(mcpServers).values(server).returning();
  return rows[0] ?? null;
}

export function listMcpServersByUser({
  userId,
}: {
  userId: string;
}): Promise<McpServerWithConnection[]> {
  return db
    .select({
      bearerConnectionId: mcpBearerConnections.id,
      oauthConnectionId: mcpOauthConnections.id,
      server: mcpServers,
    })
    .from(mcpServers)
    .leftJoin(
      mcpBearerConnections,
      and(
        eq(mcpBearerConnections.serverId, mcpServers.id),
        eq(mcpBearerConnections.userId, userId),
        isNotNull(mcpBearerConnections.token)
      )
    )
    .leftJoin(
      mcpOauthConnections,
      and(
        eq(mcpOauthConnections.serverId, mcpServers.id),
        eq(mcpOauthConnections.userId, userId),
        isNotNull(mcpOauthConnections.tokens)
      )
    )
    .where(eq(mcpServers.userId, userId))
    .orderBy(desc(mcpServers.createdAt))
    .then((rows) =>
      rows.map(({ bearerConnectionId, oauthConnectionId, server }) => ({
        ...server,
        hasConnection:
          server.authType === 'bearer'
            ? Boolean(bearerConnectionId)
            : Boolean(oauthConnectionId),
      }))
    );
}

export function listEnabledMcpServersByUser({
  userId,
}: {
  userId: string;
}): Promise<McpServer[]> {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, true)))
    .orderBy(desc(mcpServers.createdAt));
}

export function getMcpServerByIdForUser({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<McpServer | null> {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function updateMcpServerForUser({
  id,
  userId,
  values,
}: {
  id: string;
  userId: string;
  values: Partial<NewMcpServer>;
}) {
  const rows = await db
    .update(mcpServers)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteMcpServerForUser({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const rows = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export function getMcpBearerConnection({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}): Promise<McpBearerConnection | null> {
  return db
    .select()
    .from(mcpBearerConnections)
    .where(
      and(
        eq(mcpBearerConnections.serverId, serverId),
        eq(mcpBearerConnections.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export function hasMcpConnection({
  authType,
  serverId,
  userId,
}: {
  authType: string;
  serverId: string;
  userId: string;
}): Promise<boolean> {
  const table =
    authType === 'bearer' ? mcpBearerConnections : mcpOauthConnections;
  const credential =
    authType === 'bearer'
      ? mcpBearerConnections.token
      : mcpOauthConnections.tokens;
  return db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.serverId, serverId),
        eq(table.userId, userId),
        isNotNull(credential)
      )
    )
    .limit(1)
    .then((rows) => rows.length > 0);
}

export async function upsertMcpBearerConnection(
  connection: NewMcpBearerConnection
) {
  const values = {
    serverId: connection.serverId,
    teamId: connection.teamId ?? null,
    token: connection.token ?? null,
    userId: connection.userId,
  };
  const rows = await db
    .insert(mcpBearerConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [mcpBearerConnections.serverId, mcpBearerConnections.userId],
      set: {
        teamId: values.teamId,
        token: values.token,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export function getMcpOAuthConnection({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}): Promise<McpOauthConnection | null> {
  return db
    .select()
    .from(mcpOauthConnections)
    .where(
      and(
        eq(mcpOauthConnections.serverId, serverId),
        eq(mcpOauthConnections.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function upsertMcpOAuthConnection(
  connection: NewMcpOauthConnection
) {
  const values = {
    clientId: connection.clientId ?? null,
    clientInformation: connection.clientInformation ?? null,
    codeVerifier: connection.codeVerifier ?? null,
    expiresAt: connection.expiresAt ?? null,
    scopes: connection.scopes ?? null,
    serverId: connection.serverId,
    state: connection.state ?? null,
    teamId: connection.teamId ?? null,
    tokens: connection.tokens ?? null,
    userId: connection.userId,
  };
  const rows = await db
    .insert(mcpOauthConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [mcpOauthConnections.serverId, mcpOauthConnections.userId],
      set: {
        clientId: values.clientId,
        clientInformation: values.clientInformation,
        codeVerifier: values.codeVerifier,
        expiresAt: values.expiresAt,
        scopes: values.scopes,
        state: values.state,
        teamId: values.teamId,
        tokens: values.tokens,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function patchMcpOAuthConnection({
  serverId,
  userId,
  values,
}: {
  serverId: string;
  userId: string;
  values: Partial<NewMcpOauthConnection>;
}) {
  const rows = await db
    .insert(mcpOauthConnections)
    .values({
      serverId,
      teamId: values.teamId ?? null,
      userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [mcpOauthConnections.serverId, mcpOauthConnections.userId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return rows[0] ?? null;
}

export async function deleteMcpConnections({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}) {
  await Promise.all([
    db
      .delete(mcpBearerConnections)
      .where(
        and(
          eq(mcpBearerConnections.serverId, serverId),
          eq(mcpBearerConnections.userId, userId)
        )
      ),
    db
      .delete(mcpOauthConnections)
      .where(
        and(
          eq(mcpOauthConnections.serverId, serverId),
          eq(mcpOauthConnections.userId, userId)
        )
      ),
  ]);
}

export function listMcpToolPermissions({
  serverId,
  userId,
  threadTs,
}: {
  serverId: string;
  userId: string;
  threadTs?: string | null;
}): Promise<McpToolPermission[]> {
  return db
    .select()
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        threadTs
          ? or(
              and(
                eq(mcpToolPermissions.scope, 'global'),
                eq(mcpToolPermissions.threadTs, '')
              ),
              and(
                eq(mcpToolPermissions.scope, 'thread'),
                eq(mcpToolPermissions.threadTs, threadTs)
              )
            )
          : and(
              eq(mcpToolPermissions.scope, 'global'),
              eq(mcpToolPermissions.threadTs, '')
            )
      )
    );
}

export async function upsertMcpToolPermission(
  permission: NewMcpToolPermission
) {
  const rows = await db
    .insert(mcpToolPermissions)
    .values(permission)
    .onConflictDoUpdate({
      target: [
        mcpToolPermissions.serverId,
        mcpToolPermissions.userId,
        mcpToolPermissions.toolName,
        mcpToolPermissions.scope,
        mcpToolPermissions.threadTs,
      ],
      set: {
        mode: permission.mode,
        source: permission.source,
        teamId: permission.teamId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}

export function resetMcpToolPermissions({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}) {
  return db
    .delete(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.scope, 'global'),
        eq(mcpToolPermissions.threadTs, '')
      )
    );
}

export async function ensureMcpToolPermissions({
  serverId,
  userId,
  teamId,
  tools,
}: {
  serverId: string;
  userId: string;
  teamId?: string | null;
  tools: Array<{ mode: string; toolName: string }>;
}) {
  if (tools.length === 0) {
    return [];
  }

  const existing = await db
    .select()
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.scope, 'global'),
        eq(mcpToolPermissions.threadTs, ''),
        inArray(
          mcpToolPermissions.toolName,
          tools.map((tool) => tool.toolName)
        )
      )
    );
  const known = new Set(existing.map((permission) => permission.toolName));
  const rows = tools
    .filter((tool) => !known.has(tool.toolName))
    .map((tool) => ({
      mode: tool.mode,
      scope: 'global',
      serverId,
      source: 'heuristic',
      teamId,
      threadTs: '',
      toolName: tool.toolName,
      userId,
    }));

  if (rows.length === 0) {
    return existing;
  }

  const inserted = await db
    .insert(mcpToolPermissions)
    .values(rows)
    .onConflictDoNothing()
    .returning();
  if (inserted.length === rows.length) {
    return [...existing, ...inserted];
  }

  return db
    .select()
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.scope, 'global'),
        eq(mcpToolPermissions.threadTs, ''),
        inArray(
          mcpToolPermissions.toolName,
          tools.map((tool) => tool.toolName)
        )
      )
    );
}

export async function createMcpToolApproval(approval: NewMcpToolApproval) {
  const rows = await db.insert(mcpToolApprovals).values(approval).returning();
  return rows[0] ?? null;
}

export function supersedePendingMcpToolApprovals({
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
      exposedName: mcpToolApprovals.exposedName,
      messageTs: mcpToolApprovals.messageTs,
      serverId: mcpToolApprovals.serverId,
      toolName: mcpToolApprovals.toolName,
      userId: mcpToolApprovals.userId,
    });
}

export function getMcpToolApprovalStatus({
  approvalId,
}: {
  approvalId: string;
}): Promise<{
  exposedName: string;
  serverId: string;
  status: string;
  toolName: string;
  userId: string;
} | null> {
  return db
    .select({
      exposedName: mcpToolApprovals.exposedName,
      serverId: mcpToolApprovals.serverId,
      status: mcpToolApprovals.status,
      toolName: mcpToolApprovals.toolName,
      userId: mcpToolApprovals.userId,
    })
    .from(mcpToolApprovals)
    .where(eq(mcpToolApprovals.approvalId, approvalId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function claimMcpToolApproval({
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

export async function updateMcpToolApproval({
  approvalId,
  userId,
  values,
}: {
  approvalId: string;
  userId: string;
  values: Partial<NewMcpToolApproval>;
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

const OPEN_APPROVAL_STATUSES = ['pending', 'handling'] as const;

/**
 * Finalize one approval and report whether its batch is now fully settled.
 *
 * A batch is every approval raised by the same turn — same user, channel,
 * thread, and triggering message — which the model may emit several of at once
 * (parallel tool calls). The whole turn can only resume after *all* of them are
 * answered, so the click that settles the last open sibling is the one that
 * resumes. The batch rows are locked for the duration so two near-simultaneous
 * clicks serialize and exactly one observes the batch as complete.
 */
export function finalizeMcpToolApprovalInBatch({
  approvalId,
  status,
  userId,
}: {
  approvalId: string;
  status: 'approved' | 'denied';
  userId: string;
}): Promise<
  | { batchComplete: false }
  | { batchComplete: true; siblings: McpToolApproval[] }
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

    // Lock the whole batch in a single, id-ordered statement so concurrent
    // clicks acquire row locks in the same order and cannot deadlock.
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
        OPEN_APPROVAL_STATUSES.includes(
          sibling.status as (typeof OPEN_APPROVAL_STATUSES)[number]
        )
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
