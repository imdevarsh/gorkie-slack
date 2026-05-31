import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp';
import { upsertMcpOAuthConnection } from '@repo/db/queries';
import type { McpOauthConnection, McpServer } from '@repo/db/schema';
import { decryptSecret, encryptSecret } from '@repo/utils';
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

  return {
    get clientMetadata() {
      return clientMetadata;
    },
    get redirectUrl() {
      return redirectUrl.toString();
    },
    tokens() {
      return parseEncryptedJson<OAuthTokens>(
        currentConnection?.tokensJson ?? null
      );
    },
    async saveTokens(tokens) {
      currentConnection = await upsertMcpOAuthConnection({
        clientInformationJson: currentConnection?.clientInformationJson ?? null,
        codeVerifier: currentConnection?.codeVerifier ?? null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? currentConnection?.scopes ?? null,
        serverId: server.id,
        state: currentConnection?.state ?? null,
        teamId: server.teamId,
        tokensJson: encryptSecret({
          plaintext: JSON.stringify(tokens),
          secret: env.MCP_TOKEN_ENCRYPTION_KEY,
        }),
        userId: server.userId,
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
      return parseEncryptedJson<OAuthClientInformation>(
        currentConnection?.clientInformationJson ?? null
      );
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
