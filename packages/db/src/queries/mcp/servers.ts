import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../index';
import {
  type McpServer,
  mcpBearerConnections,
  mcpOauthConnections,
  mcpServers,
  type NewMcpServer,
} from '../../schema';

export interface McpServerWithConnection extends McpServer {
  hasConnection: boolean;
}

export async function createMcpServer(server: NewMcpServer) {
  const rows = await db.insert(mcpServers).values(server).returning();
  return rows[0] ?? null;
}

export function listMcpServers({
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

export function listEnabledMcpServers({
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

export function getMcpServerById({
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

export async function updateMcpServer({
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

export async function deleteMcpServer({
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
