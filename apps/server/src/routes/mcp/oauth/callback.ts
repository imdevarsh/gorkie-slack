import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { createGuardedFetch, parseMcpOAuthState } from '@repo/utils';
import { defineHandler, getQuery } from 'nitro/h3';
import { env } from '@/env';
import { createMcpOAuthProvider } from '@/utils/mcp-oauth-provider';

const guardedFetch = createGuardedFetch({
  maxResponseBytes: 10 * 1024 * 1024,
  timeoutMs: 15_000,
});

function html({ message, title }: { message: string; title: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${message}</p></body></html>`;
}

export default defineHandler(async (event) => {
  const query = getQuery(event);
  const code = typeof query.code === 'string' ? query.code : null;
  const state = typeof query.state === 'string' ? query.state : null;
  const oauthError = typeof query.error === 'string' ? query.error : null;

  event.res.headers.set('content-type', 'text/html; charset=utf-8');

  if (oauthError) {
    event.res.status = 400;
    return html({ message: oauthError, title: 'MCP OAuth Failed' });
  }

  if (!(code && state)) {
    event.res.status = 400;
    return html({
      message: 'Missing OAuth code or state.',
      title: 'MCP OAuth Failed',
    });
  }

  const parsedState = parseMcpOAuthState({
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
    state,
  });
  if (!parsedState) {
    event.res.status = 400;
    return html({
      message: 'OAuth state was invalid.',
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
    return html({
      message: 'MCP server or OAuth connection was not found.',
      title: 'MCP OAuth Failed',
    });
  }

  try {
    await auth(createMcpOAuthProvider({ connection, server }), {
      authorizationCode: code,
      callbackState: state,
      fetchFn: guardedFetch as typeof fetch,
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
    return html({
      message:
        'Could not complete OAuth. Return to Slack App Home and try again.',
      title: 'MCP OAuth Failed',
    });
  }

  return html({
    message:
      'MCP server connected. You can close this tab and return to Slack.',
    title: 'MCP Connected',
  });
});
