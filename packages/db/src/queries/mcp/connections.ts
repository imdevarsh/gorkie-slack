import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPBearerConnection,
  type MCPOAuthConnection,
  mcpBearerConnections,
  mcpOAuthConnections,
  type NewMCPBearerConnection,
  type NewMCPOAuthConnection,
} from '../../schema';

export type MCPConnection =
  | { authType: 'bearer'; connection: MCPBearerConnection }
  | { authType: 'oauth'; connection: MCPOAuthConnection };

export function getMCPBearerConnection({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}): Promise<MCPBearerConnection | null> {
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

export function getMCPOAuthConnection({
  serverId,
  userId,
}: {
  serverId: string;
  userId: string;
}): Promise<MCPOAuthConnection | null> {
  return db
    .select()
    .from(mcpOAuthConnections)
    .where(
      and(
        eq(mcpOAuthConnections.serverId, serverId),
        eq(mcpOAuthConnections.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function getMCPConnection({
  authType,
  serverId,
  userId,
}: {
  authType: string;
  serverId: string;
  userId: string;
}): Promise<MCPConnection | null> {
  if (authType === 'bearer') {
    const connection = await getMCPBearerConnection({ serverId, userId });
    return connection?.token ? { authType: 'bearer', connection } : null;
  }

  const connection = await getMCPOAuthConnection({ serverId, userId });
  return connection?.tokens ? { authType: 'oauth', connection } : null;
}

export async function hasMCPConnection({
  authType,
  serverId,
  userId,
}: {
  authType: string;
  serverId: string;
  userId: string;
}): Promise<boolean> {
  if (authType === 'bearer') {
    const rows = await db
      .select({ id: mcpBearerConnections.id })
      .from(mcpBearerConnections)
      .where(
        and(
          eq(mcpBearerConnections.serverId, serverId),
          eq(mcpBearerConnections.userId, userId),
          isNotNull(mcpBearerConnections.token)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  const rows = await db
    .select({ id: mcpOAuthConnections.id })
    .from(mcpOAuthConnections)
    .where(
      and(
        eq(mcpOAuthConnections.serverId, serverId),
        eq(mcpOAuthConnections.userId, userId),
        isNotNull(mcpOAuthConnections.tokens)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function upsertMCPBearerConnection(
  connection: NewMCPBearerConnection
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

export async function upsertMCPOAuthConnection(
  connection: NewMCPOAuthConnection
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
    .insert(mcpOAuthConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [mcpOAuthConnections.serverId, mcpOAuthConnections.userId],
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

export async function patchMCPOAuthConnection({
  serverId,
  userId,
  values,
}: {
  serverId: string;
  userId: string;
  values: Partial<NewMCPOAuthConnection>;
}) {
  const rows = await db
    .insert(mcpOAuthConnections)
    .values({
      serverId,
      teamId: values.teamId ?? null,
      userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [mcpOAuthConnections.serverId, mcpOAuthConnections.userId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return rows[0] ?? null;
}

export async function deleteMCPConnections({
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
      .delete(mcpOAuthConnections)
      .where(
        and(
          eq(mcpOAuthConnections.serverId, serverId),
          eq(mcpOAuthConnections.userId, userId)
        )
      ),
  ]);
}
