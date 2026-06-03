import { randomUUID } from 'node:crypto';
import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { patchMcpOAuthConnection } from '@repo/db/queries';
import type { McpOauthConnection, McpServer } from '@repo/db/schema';
import { createMcpOAuthState } from '@repo/utils';
import {
  mcpOAuthClientInformationSchema,
  mcpOAuthTokensSchema,
} from '@repo/validators';
import { env } from '@/env';
import { decrypt, encrypt, parseEncrypted } from './secret';

export function createMCPOAuthProvider({
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
  const saveConnection = async (
    values: Parameters<typeof patchMcpOAuthConnection>[0]['values']
  ) => {
    currentConnection = await patchMcpOAuthConnection({
      serverId: server.id,
      userId: server.userId,
      values: { teamId: server.teamId, ...values },
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
      return parseEncrypted(
        currentConnection?.tokens ?? null,
        mcpOAuthTokensSchema
      );
    },
    async saveTokens(tokens) {
      await saveConnection({
        codeVerifier: null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? currentConnection?.scopes ?? null,
        state: null,
        tokens: encrypt(JSON.stringify(tokens)),
      });
    },
    redirectToAuthorization(authorizationUrl) {
      if (authorizationUrlRef) {
        authorizationUrlRef.value = authorizationUrl;
      }
    },
    async saveCodeVerifier(codeVerifier) {
      await saveConnection({
        codeVerifier: encrypt(codeVerifier),
      });
    },
    codeVerifier() {
      if (!currentConnection?.codeVerifier) {
        throw new Error('Missing OAuth code verifier.');
      }
      return decrypt(currentConnection.codeVerifier);
    },
    clientInformation() {
      if (currentConnection?.clientId) {
        const fromDb = parseEncrypted(
          currentConnection.clientInformation ?? null,
          mcpOAuthClientInformationSchema
        );
        return fromDb ?? { client_id: currentConnection.clientId };
      }
      return parseEncrypted(
        currentConnection?.clientInformation ?? null,
        mcpOAuthClientInformationSchema
      );
    },
    async saveClientInformation(clientInformation) {
      await saveConnection({
        clientInformation: encrypt(JSON.stringify(clientInformation)),
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
        state: encrypt(state),
        tokens: null,
      });
    },
    storedState() {
      if (!currentConnection?.state) {
        return;
      }
      return decrypt(currentConnection.state);
    },
    async invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'tokens') {
        await saveConnection({
          clientId: scope === 'all' ? null : currentConnection?.clientId,
          clientInformation:
            scope === 'all' ? null : currentConnection?.clientInformation,
          codeVerifier:
            scope === 'all' ? null : currentConnection?.codeVerifier,
          expiresAt: null,
          scopes: null,
          state: scope === 'all' ? null : currentConnection?.state,
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
