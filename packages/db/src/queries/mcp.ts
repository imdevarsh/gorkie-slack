import { and, desc, eq } from 'drizzle-orm';
import { db } from '../index';
import {
  type McpOauthConnection,
  type McpServer,
  mcpOauthConnections,
  mcpServers,
  type NewMcpOauthConnection,
  type NewMcpServer,
} from '../schema';

export interface McpServerWithOAuth extends McpServer {
  hasOAuthConnection: boolean;
}

export async function createMcpServer(server: NewMcpServer) {
  const rows = await db.insert(mcpServers).values(server).returning();
  return rows[0] ?? null;
}

export function listMcpServersByUser({
  userId,
  limit = 20,
}: {
  userId: string;
  limit?: number;
}): Promise<McpServerWithOAuth[]> {
  return db
    .select({ server: mcpServers, oauth: mcpOauthConnections.id })
    .from(mcpServers)
    .leftJoin(
      mcpOauthConnections,
      and(
        eq(mcpOauthConnections.serverId, mcpServers.id),
        eq(mcpOauthConnections.userId, userId)
      )
    )
    .where(eq(mcpServers.userId, userId))
    .orderBy(desc(mcpServers.createdAt))
    .limit(limit)
    .then((rows) =>
      rows.map(({ server, oauth }) => ({
        ...server,
        hasOAuthConnection: Boolean(oauth),
      }))
    );
}

export function listEnabledMcpServersByUser({
  userId,
  limit,
}: {
  userId: string;
  limit: number;
}): Promise<McpServer[]> {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, true)))
    .orderBy(desc(mcpServers.createdAt))
    .limit(limit);
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
  await db
    .delete(mcpOauthConnections)
    .where(
      and(
        eq(mcpOauthConnections.serverId, id),
        eq(mcpOauthConnections.userId, userId)
      )
    );
  const rows = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
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

export function getMcpOAuthConnectionByState(
  state: string
): Promise<McpOauthConnection | null> {
  return db
    .select()
    .from(mcpOauthConnections)
    .where(eq(mcpOauthConnections.state, state))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function upsertMcpOAuthConnection(
  connection: NewMcpOauthConnection
) {
  const existing = await getMcpOAuthConnection({
    serverId: connection.serverId,
    userId: connection.userId,
  });

  if (existing) {
    const rows = await db
      .update(mcpOauthConnections)
      .set({ ...connection, updatedAt: new Date() })
      .where(eq(mcpOauthConnections.id, existing.id))
      .returning();
    return rows[0] ?? null;
  }

  const rows = await db
    .insert(mcpOauthConnections)
    .values(connection)
    .returning();
  return rows[0] ?? null;
}

export async function deleteMcpOAuthConnection({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}) {
  const rows = await db
    .delete(mcpOauthConnections)
    .where(
      and(
        eq(mcpOauthConnections.serverId, serverId),
        eq(mcpOauthConnections.userId, userId)
      )
    )
    .returning();
  return rows[0] ?? null;
}
