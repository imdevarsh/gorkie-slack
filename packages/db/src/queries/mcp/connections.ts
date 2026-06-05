import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../index';
import {
  type McpBearerConnection,
  type McpOauthConnection,
  mcpBearerConnections,
  mcpOauthConnections,
  type NewMcpBearerConnection,
  type NewMcpOauthConnection,
} from '../../schema';

export type McpConnection =
  | { authType: 'bearer'; connection: McpBearerConnection }
  | { authType: 'oauth'; connection: McpOauthConnection };

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

export async function getMcpConnection({
  authType,
  serverId,
  userId,
}: {
  authType: string;
  serverId: string;
  userId: string;
}): Promise<McpConnection | null> {
  if (authType === 'bearer') {
    const connection = await getMcpBearerConnection({ serverId, userId });
    return connection?.token ? { authType: 'bearer', connection } : null;
  }

  const connection = await getMcpOAuthConnection({ serverId, userId });
  return connection?.tokens ? { authType: 'oauth', connection } : null;
}

export async function hasMcpConnection({
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
    .select({ id: mcpOauthConnections.id })
    .from(mcpOauthConnections)
    .where(
      and(
        eq(mcpOauthConnections.serverId, serverId),
        eq(mcpOauthConnections.userId, userId),
        isNotNull(mcpOauthConnections.tokens)
      )
    )
    .limit(1);
  return rows.length > 0;
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
