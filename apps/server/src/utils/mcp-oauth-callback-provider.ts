import type { OAuthClientMetadata, OAuthClientProvider } from '@ai-sdk/mcp';
import { patchMCPOAuthConnection } from '@repo/db/queries';
import type { MCPOAuthConnection, MCPServer } from '@repo/db/schema';
import {
  mcpOAuthClientInformationSchema,
  mcpOAuthTokensSchema,
} from '@repo/validators';
import { env } from '@/env';
import { decrypt, encrypt, parseEncrypted } from './mcp-encryption';

export function createMCPOAuthCallbackProvider({
  connection,
  server,
}: {
  connection: MCPOAuthConnection;
  server: MCPServer;
}): OAuthClientProvider {
  let storedConnection: MCPOAuthConnection | null = connection;
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
      values,
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
      return parseEncrypted({
        encrypted: storedConnection?.tokens ?? null,
        schema: mcpOAuthTokensSchema,
      });
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
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: () => undefined,
    codeVerifier() {
      if (!storedConnection?.codeVerifier) {
        throw new Error('Missing OAuth code verifier.');
      }
      return decrypt(storedConnection.codeVerifier);
    },
    clientInformation() {
      if (storedConnection?.clientId) {
        const fromDb = parseEncrypted({
          encrypted: storedConnection.clientInformation ?? null,
          schema: mcpOAuthClientInformationSchema,
        });
        return fromDb ?? { client_id: storedConnection.clientId };
      }
      return parseEncrypted({
        encrypted: storedConnection?.clientInformation ?? null,
        schema: mcpOAuthClientInformationSchema,
      });
    },
    saveClientInformation: () => undefined,
    storedState() {
      if (!storedConnection?.state) {
        return;
      }
      return decrypt(storedConnection.state);
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
