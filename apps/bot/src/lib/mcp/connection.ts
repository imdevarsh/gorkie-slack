import type { ListToolsResult } from '@ai-sdk/mcp';
import { auth } from '@ai-sdk/mcp';
import {
  deleteMcpConnections,
  ensureMcpToolModes,
  getMcpOAuthConnection,
  updateMcpServer,
  upsertMcpBearerConnection,
} from '@repo/db/queries';
import type { McpServer, McpToolMode } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { mcp } from '@/config';
import { encrypt } from './encryption';
import { guardedMCPFetch } from './guarded-fetch';
import { createMcpOAuthProvider } from './oauth-provider';
import { fetchTools, getMcpCredential } from './remote';

const defaultToolMode: McpToolMode =
  mcp.defaultToolMode === 'allow' || mcp.defaultToolMode === 'block'
    ? mcp.defaultToolMode
    : 'ask';

async function finalizeSuccess({
  definitions,
  serverId,
  teamId,
  userId,
}: {
  definitions: ListToolsResult;
  serverId: string;
  teamId?: string | null;
  userId: string;
}): Promise<void> {
  await ensureMcpToolModes({
    defaultMode: defaultToolMode,
    serverId,
    teamId,
    toolNames: definitions.tools.map((definition) => definition.name),
    userId,
  });
  await updateMcpServer({
    id: serverId,
    userId,
    values: { enabled: true, lastConnectedAt: new Date(), lastError: null },
  });
}

async function finalizeFailure({
  error,
  serverId,
  userId,
}: {
  error: unknown;
  serverId: string;
  userId: string;
}): Promise<void> {
  await deleteMcpConnections({ serverId, userId });
  await updateMcpServer({
    id: serverId,
    userId,
    values: {
      enabled: false,
      lastConnectedAt: null,
      lastError: errorMessage(error),
    },
  });
}

export async function connectBearerServer({
  rawToken,
  server,
  teamId,
  userId,
}: {
  rawToken: string;
  server: McpServer;
  teamId?: string | null;
  userId: string;
}): Promise<void> {
  try {
    const definitions = await fetchTools({
      credential: { type: 'bearer', token: rawToken },
      server,
    });
    await upsertMcpBearerConnection({
      token: encrypt(rawToken),
      serverId: server.id,
      teamId: teamId ?? null,
      userId,
    });
    await finalizeSuccess({ definitions, serverId: server.id, teamId, userId });
  } catch (error) {
    await finalizeFailure({ error, serverId: server.id, userId });
    throw error;
  }
}

export type OAuthConnectResult =
  | { status: 'authorize'; authorizationUrl: string }
  | { status: 'connected' };

export async function connectOAuthServer({
  server,
  teamId,
  userId,
}: {
  server: McpServer;
  teamId?: string | null;
  userId: string;
}): Promise<OAuthConnectResult> {
  const connection = await getMcpOAuthConnection({
    serverId: server.id,
    userId,
  });
  const authorizationURLRef: { value?: URL } = {};

  try {
    await auth(
      createMcpOAuthProvider({ authorizationURLRef, connection, server }),
      { fetchFn: guardedMCPFetch, serverUrl: server.url }
    );
  } catch (error) {
    await finalizeFailure({ error, serverId: server.id, userId });
    throw error;
  }

  if (authorizationURLRef.value) {
    return {
      status: 'authorize',
      authorizationUrl: authorizationURLRef.value.toString(),
    };
  }

  await finalizeOAuthServer({ server, teamId, userId });
  return { status: 'connected' };
}

export async function finalizeOAuthServer({
  server,
  teamId,
  userId,
}: {
  server: McpServer;
  teamId?: string | null;
  userId: string;
}): Promise<void> {
  try {
    const credential = await getMcpCredential({ server, userId });
    if (!credential) {
      throw new Error('OAuth connection required before tools can be used.');
    }
    const definitions = await fetchTools({ credential, server });
    await finalizeSuccess({ definitions, serverId: server.id, teamId, userId });
  } catch (error) {
    await finalizeFailure({ error, serverId: server.id, userId });
    throw error;
  }
}
