import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { upsertMcpOAuthConnection } from '@repo/db/queries';
import type {
  McpOauthConnection,
  McpServer,
  NewMcpOauthConnection,
} from '@repo/db/schema';
import { decryptSecret, encryptSecret, parseEncrypted } from '@repo/utils';
import {
  mcpOAuthClientInformationSchema,
  mcpOAuthTokensSchema,
} from '@repo/validators';
import { env } from '@/env';

export function createMcpOAuthProvider({
  connection,
  server,
}: {
  connection: McpOauthConnection;
  server: McpServer;
}): OAuthClientProvider {
  let currentConnection: McpOauthConnection | null = connection;
  const redirectUrl = new URL('/mcp/oauth/callback', env.SERVER_BASE_URL);
  const clientMetadata: OAuthClientMetadata = {
    client_name: 'Gorkie MCP',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [redirectUrl.toString()],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
  const saveConnection = async (values: Partial<NewMcpOauthConnection>) => {
    currentConnection = await upsertMcpOAuthConnection({
      clientId: currentConnection?.clientId ?? null,
      clientInformation: currentConnection?.clientInformation ?? null,
      codeVerifier: currentConnection?.codeVerifier ?? null,
      expiresAt: currentConnection?.expiresAt ?? null,
      scopes: currentConnection?.scopes ?? null,
      serverId: server.id,
      state: currentConnection?.state ?? null,
      teamId: server.teamId,
      tokens: currentConnection?.tokens ?? null,
      userId: server.userId,
      ...values,
    });
  };

  return {
    get clientMetadata() {
      return clientMetadata;
    },
    get redirectUrl() {
      return redirectUrl.toString();
    },
    tokens() {
      return parseEncrypted({
        encrypted: currentConnection?.tokens ?? null,
        schema: mcpOAuthTokensSchema,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    async saveTokens(tokens) {
      await saveConnection({
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? currentConnection?.scopes ?? null,
        tokens: encryptSecret({
          plaintext: JSON.stringify(tokens),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
      });
    },
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: () => undefined,
    codeVerifier() {
      if (!currentConnection?.codeVerifier) {
        throw new Error('Missing OAuth code verifier.');
      }
      return decryptSecret({
        encrypted: currentConnection.codeVerifier,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    clientInformation() {
      if (currentConnection?.clientId) {
        const fromDb = parseEncrypted({
          encrypted: currentConnection?.clientInformation ?? null,
          schema: mcpOAuthClientInformationSchema,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        });
        return fromDb ?? { client_id: currentConnection.clientId };
      }
      return parseEncrypted({
        encrypted: currentConnection?.clientInformation ?? null,
        schema: mcpOAuthClientInformationSchema,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    saveClientInformation: () => undefined,
    storedState() {
      if (!currentConnection?.state) {
        return;
      }
      return decryptSecret({
        encrypted: currentConnection.state,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    validateResourceURL(serverUrl, resource) {
      const configured = new URL(server.url);
      const requested = new URL(resource ?? serverUrl);
      if (requested.origin !== configured.origin) {
        throw new Error(
          'OAuth protected resource must match MCP server origin.'
        );
      }
      return Promise.resolve(requested);
    },
  };
}
