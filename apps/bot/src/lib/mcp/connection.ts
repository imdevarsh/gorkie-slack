import type { ListToolsResult } from '@ai-sdk/mcp';
import { auth } from '@ai-sdk/mcp';
import {
  deleteMCPConnections,
  ensureMCPToolModes,
  getMCPOAuthConnection,
  updateMCPServer,
  upsertMCPBearerConnection,
} from '@repo/db/queries';
import type { MCPServer } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { encrypt } from './encryption';
import { guardedMCPFetch } from './guarded-fetch';
import { createMCPOAuthProvider } from './oauth-provider';
import { defaultToolMode, fetchTools, getMCPCredential } from './remote';

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
  await ensureMCPToolModes({
    defaultMode: defaultToolMode,
    serverId,
    teamId,
    toolNames: definitions.tools.map((definition) => definition.name),
    userId,
  });
  await updateMCPServer({
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
  await deleteMCPConnections({ serverId, userId });
  await updateMCPServer({
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
  server: MCPServer;
  teamId?: string | null;
  userId: string;
}): Promise<void> {
  try {
    const definitions = await fetchTools({
      credential: { type: 'bearer', token: rawToken },
      server,
    });
    await upsertMCPBearerConnection({
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
  | { authorizationURL: string; status: 'authorize' }
  | { status: 'connected' };

export async function connectOAuthServer({
  server,
  teamId,
  userId,
}: {
  server: MCPServer;
  teamId?: string | null;
  userId: string;
}): Promise<OAuthConnectResult> {
  const connection = await getMCPOAuthConnection({
    serverId: server.id,
    userId,
  });
  const authorizationURLRef: { value?: URL } = {};

  try {
    await auth(
      createMCPOAuthProvider({ authorizationURLRef, connection, server }),
      { fetchFn: guardedMCPFetch, serverUrl: server.url }
    );
  } catch (error) {
    await finalizeFailure({ error, serverId: server.id, userId });
    throw error;
  }

  if (authorizationURLRef.value) {
    return {
      authorizationURL: authorizationURLRef.value.toString(),
      status: 'authorize',
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
  server: MCPServer;
  teamId?: string | null;
  userId: string;
}): Promise<void> {
  try {
    const credential = await getMCPCredential({ server, userId });
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
