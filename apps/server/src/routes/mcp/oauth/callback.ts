import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { createGuardedFetch, parseMcpOAuthState } from '@repo/utils';
import { defineHandler, getQuery } from 'nitro/h3';
import { env } from '@/env';
import {
  parseMcpOAuthCallbackQuery,
  renderMcpOAuthCallbackPage,
} from '@/utils/mcp-oauth-callback';
import { createMcpOAuthProvider } from '@/utils/mcp-oauth-provider';

const guardedFetch = Object.assign(
  createGuardedFetch({
    maxResponseBytes: 10 * 1024 * 1024,
    timeoutMs: 15_000,
  }),
  { preconnect: fetch.preconnect }
);

export default defineHandler(async (event) => {
  const { code, oauthError, state } = parseMcpOAuthCallbackQuery({
    query: getQuery(event),
  });

  event.res.headers.set('content-type', 'text/html; charset=utf-8');

  if (oauthError) {
    event.res.status = 400;
    return renderMcpOAuthCallbackPage({
      message: oauthError,
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  if (!(code && state)) {
    event.res.status = 400;
    return renderMcpOAuthCallbackPage({
      message: 'Missing OAuth code or state.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  const parsedState = parseMcpOAuthState({
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    state,
  });
  if (!parsedState) {
    event.res.status = 400;
    return renderMcpOAuthCallbackPage({
      message: 'OAuth state was invalid.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  const [server, connection] = await Promise.all([
    getMcpServerByIdForUser({
      id: parsedState.serverId,
      userId: parsedState.userId,
    }),
    getMcpOAuthConnection({
      serverId: parsedState.serverId,
      userId: parsedState.userId,
    }),
  ]);

  if (!(server && connection)) {
    event.res.status = 404;
    return renderMcpOAuthCallbackPage({
      message: 'MCP server or OAuth connection was not found.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  try {
    await auth(createMcpOAuthProvider({ connection, server }), {
      authorizationCode: code,
      callbackState: state,
      fetchFn: guardedFetch,
      serverUrl: server.url,
    });
    await updateMcpServerForUser({
      id: server.id,
      userId: server.userId,
      values: {
        enabled: true,
        lastConnectedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    await updateMcpServerForUser({
      id: server.id,
      userId: server.userId,
      values: {
        enabled: false,
        lastError: error instanceof Error ? error.message : 'OAuth failed',
      },
    });
    event.res.status = 400;
    return renderMcpOAuthCallbackPage({
      message:
        'Could not complete OAuth. Return to Slack App Home and try again.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  return renderMcpOAuthCallbackPage({
    message: 'You can close this tab and go back to Slack.',
    status: 'success',
    title: 'Connected to Gorkie',
  });
});
