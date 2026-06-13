import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../index';
import {
  type MCPAuthType,
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
  authType: MCPAuthType;
  serverId: string;
  userId: string;
}): Promise<MCPConnection | null> {
  if (authType === 'bearer') {
    const connection = await getMCPBearerConnection({ serverId, userId });
    return connection?.token ? { authType: 'bearer', connection } : null;
  }

  if (authType === 'oauth') {
    const connection = await getMCPOAuthConnection({ serverId, userId });
    return connection?.tokens ? { authType: 'oauth', connection } : null;
  }

  return null;
}

export async function hasMCPConnection({
  authType,
  serverId,
  userId,
}: {
  authType: MCPAuthType;
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

  if (authType === 'oauth') {
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

  return false;
}

export async function upsertMCPBearerConnection(
  connection: NewMCPBearerConnection
) {
  const values = {
    serverId: connection.serverId,
    token: connection.token ?? null,
    userId: connection.userId,
  };
  const rows = await db
    .insert(mcpBearerConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [mcpBearerConnections.serverId, mcpBearerConnections.userId],
      set: {
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
  values: Partial<
    Pick<
      NewMCPOAuthConnection,
      | 'clientId'
      | 'clientInformation'
      | 'codeVerifier'
      | 'expiresAt'
      | 'scopes'
      | 'state'
      | 'tokens'
    >
  >;
}) {
  const rows = await db
    .insert(mcpOAuthConnections)
    .values({
      serverId,
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
