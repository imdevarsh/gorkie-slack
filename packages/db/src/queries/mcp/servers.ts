import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPServer,
  mcpBearerConnections,
  mcpOAuthConnections,
  mcpServers,
  type NewMCPServer,
} from '../../schema';

export interface MCPServerWithConnection extends MCPServer {
  hasConnection: boolean;
}

// url, transport, and authType are immutable after creation: editing them
// would re-aim stored credentials at a new host. Changing the connection
// requires delete + re-add (docs/mcp-improvements.md item 1).
type MCPServerUpdate = Partial<
  Pick<NewMCPServer, 'enabled' | 'lastConnectedAt' | 'lastError' | 'name'>
>;

export async function createMCPServer(server: NewMCPServer) {
  const rows = await db.insert(mcpServers).values(server).returning();
  return rows[0] ?? null;
}

export function listMCPServers({
  userId,
}: {
  userId: string;
}): Promise<MCPServerWithConnection[]> {
  return db
    .select({
      bearerConnectionId: mcpBearerConnections.id,
      oauthConnectionId: mcpOAuthConnections.id,
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
      mcpOAuthConnections,
      and(
        eq(mcpOAuthConnections.serverId, mcpServers.id),
        eq(mcpOAuthConnections.userId, userId),
        isNotNull(mcpOAuthConnections.tokens)
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

export function listEnabledMCPServers({
  userId,
}: {
  userId: string;
}): Promise<MCPServer[]> {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, true)))
    .orderBy(desc(mcpServers.createdAt));
}

export function getMCPServerById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<MCPServer | null> {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function updateMCPServer({
  id,
  userId,
  values,
}: {
  id: string;
  userId: string;
  values: MCPServerUpdate;
}) {
  const rows = await db
    .update(mcpServers)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteMCPServer({
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
