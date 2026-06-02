import { randomUUID } from 'node:crypto';
import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { patchMcpOAuthConnection } from '@repo/db/queries';
import type { McpOauthConnection, McpServer } from '@repo/db/schema';
import {
  createMcpOAuthState,
  decryptSecret,
  encryptSecret,
  parseEncrypted,
} from '@repo/utils';
import {
  mcpOAuthClientInformationSchema,
  mcpOAuthTokensSchema,
} from '@repo/validators';
import { env } from '@/env';

export function createMcpOAuthProvider({
  authorizationUrlRef,
  connection,
  server,
}: {
  authorizationUrlRef?: { value?: URL };
  connection: McpOauthConnection | null;
  server: McpServer;
}): OAuthClientProvider {
  let currentConnection = connection;
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
    redirectToAuthorization(authorizationUrl) {
      if (authorizationUrlRef) {
        authorizationUrlRef.value = authorizationUrl;
      }
    },
    async saveCodeVerifier(codeVerifier) {
      await saveConnection({
        codeVerifier: encryptSecret({
          plaintext: codeVerifier,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
      });
    },
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
    async saveClientInformation(clientInformation) {
      await saveConnection({
        clientInformation: encryptSecret({
          plaintext: JSON.stringify(clientInformation),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
      });
    },
    state() {
      return createMcpOAuthState({
        nonce: randomUUID(),
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        serverId: server.id,
        userId: server.userId,
      });
    },
    async saveState(state) {
      await saveConnection({
        codeVerifier: null,
        expiresAt: null,
        scopes: null,
        state: encryptSecret({
          plaintext: state,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        tokens: null,
      });
    },
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
    async invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'tokens') {
        await saveConnection({
          clientId:
            scope === 'all' ? null : currentServerConnection()?.clientId,
          clientInformation:
            scope === 'all'
              ? null
              : currentServerConnection()?.clientInformation,
          codeVerifier:
            scope === 'all' ? null : currentServerConnection()?.codeVerifier,
          expiresAt: null,
          scopes: null,
          state: scope === 'all' ? null : currentServerConnection()?.state,
          tokens: null,
        });
      }
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
