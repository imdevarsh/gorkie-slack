import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { patchMcpOAuthConnection } from '@repo/db/queries';
import type { McpOauthConnection, McpServer } from '@repo/db/schema';
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
  const currentServerConnection = () =>
    currentConnection?.serverUrl === server.url ? currentConnection : null;
  const clientMetadata: OAuthClientMetadata = {
    client_name: 'Gorkie MCP',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [redirectUrl.toString()],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
  const saveConnection = async (
    values: Parameters<typeof patchMcpOAuthConnection>[0]['values']
  ) => {
    currentConnection = await patchMcpOAuthConnection({
      serverId: server.id,
      userId: server.userId,
      values: { serverUrl: server.url, teamId: server.teamId, ...values },
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
      const connection = currentServerConnection();
      return parseEncrypted({
        encrypted: connection?.tokens ?? null,
        schema: mcpOAuthTokensSchema,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    async saveTokens(tokens) {
      await saveConnection({
        codeVerifier: null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? currentServerConnection()?.scopes ?? null,
        state: null,
        tokens: encryptSecret({
          plaintext: JSON.stringify(tokens),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
      });
    },
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: () => undefined,
    codeVerifier() {
      const connection = currentServerConnection();
      if (!connection?.codeVerifier) {
        throw new Error('Missing OAuth code verifier.');
      }
      return decryptSecret({
        encrypted: connection.codeVerifier,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    clientInformation() {
      const connection = currentServerConnection();
      if (connection?.clientId) {
        const fromDb = parseEncrypted({
          encrypted: connection.clientInformation ?? null,
          schema: mcpOAuthClientInformationSchema,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        });
        return fromDb ?? { client_id: connection.clientId };
      }
      return parseEncrypted({
        encrypted: connection?.clientInformation ?? null,
        schema: mcpOAuthClientInformationSchema,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    saveClientInformation: () => undefined,
    storedState() {
      const connection = currentServerConnection();
      if (!connection?.state) {
        return;
      }
      return decryptSecret({
        encrypted: connection.state,
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
