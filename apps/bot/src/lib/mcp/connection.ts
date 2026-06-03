import type { ListToolsResult } from '@ai-sdk/mcp';
import { auth } from '@ai-sdk/mcp';
import {
  deleteMcpConnections,
  ensureMcpToolPermissions,
  getMcpOAuthConnection,
  updateMcpServerForUser,
  upsertMcpBearerConnection,
} from '@repo/db/queries';
import type { McpServer } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { mcp } from '@/config';
import { guardedMCPFetch } from './guarded-fetch';
import { createMCPOAuthProvider } from './oauth-provider';
import { fetchTools, resolveMCPCredential } from './remote';
import { encrypt } from './secret';

/**
 * MCP Connection SOP — validate before persist, nuke on failure.
 *
 * A server is "connected" only after its credential is PROVEN to work by a
 * successful tool discovery. We never leave a half-saved state where a
 * credential is stored but the server is broken.
 *
 * Resulting DB states are mutually exclusive:
 *   - no connection row                 -> "… required" (needs Connect)
 *   - connection row, enabled, no error -> "… saved", ready
 *   - connection row WITH lastError     -> impossible; failure nukes the row
 *
 * Bearer: probe with the in-memory token (nothing written), then on success
 *   persist + enable; on failure nuke + disable.
 * OAuth: the handshake performs the token exchange, discovery proves it, then
 *   on success enable; on failure nuke + disable.
 *
 * Both flows funnel through finalizeFailure/finalizeSuccess so they can never
 * diverge or clash.
 */

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
  await ensureMcpToolPermissions({
    serverId,
    teamId,
    userId,
    tools: definitions.tools.map((definition) => ({
      mode: mcp.defaultToolMode,
      toolName: definition.name,
    })),
  });
  await updateMcpServerForUser({
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
  // Nuke the credential — a failed connection never stays "saved".
  await deleteMcpConnections({ serverId, userId });
  await updateMcpServerForUser({
    id: serverId,
    userId,
    values: {
      enabled: false,
      lastConnectedAt: null,
      lastError: errorMessage(error),
    },
  });
}

/**
 * Validate a bearer token by probing tools, then persist + enable.
 * On failure the token is never stored. Throws the original error.
 */
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

/**
 * Result of an OAuth connect attempt.
 * - `authorizationUrl` set  -> user must finish the browser flow, then the
 *   modal-closed handler calls finalizeOAuthServer().
 * - otherwise               -> already authorized + validated + enabled.
 */
export type OAuthConnectResult =
  | { status: 'authorize'; authorizationUrl: string }
  | { status: 'connected' };

/**
 * Run the OAuth handshake. If the server is already authorized, validate and
 * enable immediately; otherwise return the authorization URL for the browser
 * step. On failure the credential is nuked. Throws the original error.
 */
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
  const authorizationUrlRef: { value?: URL } = {};

  try {
    await auth(
      createMCPOAuthProvider({ authorizationUrlRef, connection, server }),
      { fetchFn: guardedMCPFetch, serverUrl: server.url }
    );
  } catch (error) {
    await finalizeFailure({ error, serverId: server.id, userId });
    throw error;
  }

  if (authorizationUrlRef.value) {
    return {
      status: 'authorize',
      authorizationUrl: authorizationUrlRef.value.toString(),
    };
  }

  await finalizeOAuthServer({ server, teamId, userId });
  return { status: 'connected' };
}

/**
 * Validate + enable an OAuth server after its tokens are present (either the
 * silent path above, or after the browser flow completes). On failure the
 * credential is nuked. Throws the original error.
 */
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
    const credential = await resolveMCPCredential({ server, userId });
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
