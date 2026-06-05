import { randomUUID } from 'node:crypto';
import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { patchMCPOAuthConnection } from '@repo/db/queries';
import type { MCPOAuthConnection, MCPServer } from '@repo/db/schema';
import { createMCPOAuthState } from '@repo/utils';
import {
  mcpOAuthClientInformationSchema,
  mcpOAuthTokensSchema,
} from '@repo/validators';
import { env } from '@/env';
import { decrypt, encrypt, parseEncrypted } from './encryption';

export function createMCPOAuthProvider({
  authorizationURLRef,
  connection,
  server,
}: {
  authorizationURLRef?: { value?: URL };
  connection: MCPOAuthConnection | null;
  server: MCPServer;
}): OAuthClientProvider {
  let storedConnection = connection;
  const redirectURL = new URL('/mcp/oauth/callback', env.SERVER_BASE_URL);
  const clientMetadata: OAuthClientMetadata = {
    client_name: 'Gorkie MCP',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [redirectURL.toString()],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
  const saveConnection = async (
    values: Parameters<typeof patchMCPOAuthConnection>[0]['values']
  ) => {
    storedConnection = await patchMCPOAuthConnection({
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
      return redirectURL.toString();
    },
    tokens() {
      return parseEncrypted(
        storedConnection?.tokens ?? null,
        mcpOAuthTokensSchema
      );
    },
    async saveTokens(tokens) {
      await saveConnection({
        codeVerifier: null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? storedConnection?.scopes ?? null,
        state: null,
        tokens: encrypt(JSON.stringify(tokens)),
      });
    },
    redirectToAuthorization(authorizationUrl) {
      if (authorizationURLRef) {
        authorizationURLRef.value = authorizationUrl;
      }
    },
    async saveCodeVerifier(codeVerifier) {
      await saveConnection({
        codeVerifier: encrypt(codeVerifier),
      });
    },
    codeVerifier() {
      if (!storedConnection?.codeVerifier) {
        throw new Error('Missing OAuth code verifier.');
      }
      return decrypt(storedConnection.codeVerifier);
    },
    clientInformation() {
      if (storedConnection?.clientId) {
        const fromDb = parseEncrypted(
          storedConnection.clientInformation ?? null,
          mcpOAuthClientInformationSchema
        );
        return fromDb ?? { client_id: storedConnection.clientId };
      }
      return parseEncrypted(
        storedConnection?.clientInformation ?? null,
        mcpOAuthClientInformationSchema
      );
    },
    async saveClientInformation(clientInformation) {
      await saveConnection({
        clientInformation: encrypt(JSON.stringify(clientInformation)),
      });
    },
    state() {
      return createMCPOAuthState({
        nonce: randomUUID(),
        secret: env.MCP_ENCRYPTION_KEY,
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
      if (!storedConnection?.state) {
        return;
      }
      return decrypt(storedConnection.state);
    },
    async invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'tokens') {
        await saveConnection({
          clientId: scope === 'all' ? null : storedConnection?.clientId,
          clientInformation:
            scope === 'all' ? null : storedConnection?.clientInformation,
          codeVerifier: scope === 'all' ? null : storedConnection?.codeVerifier,
          expiresAt: null,
          scopes: null,
          state: scope === 'all' ? null : storedConnection?.state,
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
