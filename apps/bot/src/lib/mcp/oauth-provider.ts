import { randomUUID } from 'node:crypto';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp';
import { upsertMcpOAuthConnection } from '@repo/db/queries';
import type { McpOauthConnection, McpServer } from '@repo/db/schema';
import { createMcpOAuthState, decryptSecret, encryptSecret } from '@repo/utils';
import { env } from '@/env';

function parseEncryptedJson<T>(value: string | null): T | undefined {
  if (!value) {
    return;
  }
  return JSON.parse(
    decryptSecret({ encrypted: value, secret: env.MCP_TOKEN_ENCRYPTION_KEY })
  ) as T;
}

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
  const clientMetadata: OAuthClientMetadata = {
    client_name: 'Gorkie MCP',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [redirectUrl.toString()],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };

  return {
    get clientMetadata() {
      return clientMetadata;
    },
    get redirectUrl() {
      return redirectUrl.toString();
    },
    tokens() {
      return parseEncryptedJson<OAuthTokens>(currentConnection?.tokens ?? null);
    },
    async saveTokens(tokens) {
      currentConnection = await upsertMcpOAuthConnection({
        clientId: currentConnection?.clientId ?? null,
        clientInformation: currentConnection?.clientInformation ?? null,
        codeVerifier: currentConnection?.codeVerifier ?? null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? currentConnection?.scopes ?? null,
        serverId: server.id,
        state: currentConnection?.state ?? null,
        teamId: server.teamId,
        tokens: encryptSecret({
          plaintext: JSON.stringify(tokens),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        userId: server.userId,
      });
    },
    redirectToAuthorization(authorizationUrl) {
      if (authorizationUrlRef) {
        authorizationUrlRef.value = authorizationUrl;
      }
    },
    async saveCodeVerifier(codeVerifier) {
      currentConnection = await upsertMcpOAuthConnection({
        clientId: currentConnection?.clientId ?? null,
        clientInformation: currentConnection?.clientInformation ?? null,
        codeVerifier: encryptSecret({
          plaintext: codeVerifier,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        expiresAt: currentConnection?.expiresAt ?? null,
        scopes: currentConnection?.scopes ?? null,
        serverId: server.id,
        state: currentConnection?.state ?? null,
        teamId: server.teamId,
        tokens: currentConnection?.tokens ?? null,
        userId: server.userId,
      });
    },
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
        const fromDb = parseEncryptedJson<OAuthClientInformation>(
          currentConnection?.clientInformation ?? null
        );
        return fromDb ?? { client_id: currentConnection.clientId };
      }
      return parseEncryptedJson<OAuthClientInformation>(
        currentConnection?.clientInformation ?? null
      );
    },
    async saveClientInformation(clientInformation) {
      currentConnection = await upsertMcpOAuthConnection({
        clientId: currentConnection?.clientId ?? null,
        clientInformation: encryptSecret({
          plaintext: JSON.stringify(clientInformation),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        codeVerifier: currentConnection?.codeVerifier ?? null,
        expiresAt: currentConnection?.expiresAt ?? null,
        scopes: currentConnection?.scopes ?? null,
        serverId: server.id,
        state: currentConnection?.state ?? null,
        teamId: server.teamId,
        tokens: currentConnection?.tokens ?? null,
        userId: server.userId,
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
      currentConnection = await upsertMcpOAuthConnection({
        clientId: currentConnection?.clientId ?? null,
        clientInformation: currentConnection?.clientInformation ?? null,
        codeVerifier: null,
        expiresAt: null,
        scopes: null,
        serverId: server.id,
        state: encryptSecret({
          plaintext: state,
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        teamId: server.teamId,
        tokens: null,
        userId: server.userId,
      });
    },
    storedState() {
      if (!currentConnection?.state) {
        return;
      }
      return decryptSecret({
        encrypted: currentConnection.state,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      });
    },
    async invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'tokens') {
        currentConnection = await upsertMcpOAuthConnection({
          clientId:
            scope === 'all' ? null : (currentConnection?.clientId ?? null),
          clientInformation:
            scope === 'all'
              ? null
              : (currentConnection?.clientInformation ?? null),
          codeVerifier:
            scope === 'all' ? null : (currentConnection?.codeVerifier ?? null),
          expiresAt: null,
          scopes: null,
          serverId: server.id,
          state: scope === 'all' ? null : (currentConnection?.state ?? null),
          teamId: server.teamId,
          tokens: null,
          userId: server.userId,
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
