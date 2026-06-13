import { auth, createMCPClient } from '@ai-sdk/mcp';
import {
  deleteMCPConnections,
  ensureMCPToolModes,
  getMCPOAuthConnection,
  getMCPServerById,
  updateMCPServer,
} from '@repo/db/queries';
import { createGuardedFetch, parseMCPOAuthState } from '@repo/utils';
import escapeHtml from 'escape-html';
import { defineHandler, getQuery, getRequestURL } from 'nitro/h3';
import { useStorage } from 'nitro/storage';
import { mcp } from '@/config';
import { env } from '@/env';
import { createMCPOAuthCallbackProvider } from '@/utils/mcp-oauth-callback-provider';

const guardedFetch = Object.assign(
  createGuardedFetch({
    timeoutMs: mcp.requestTimeoutMs,
  }),
  { preconnect: fetch.preconnect }
);

async function renderPage({
  message,
  status,
  title,
}: {
  message: string;
  status: 'error' | 'success';
  title: string;
}): Promise<string> {
  const template = await useStorage('assets:templates').getItem<string>(
    'oauth-callback.html'
  );
  if (!template) {
    throw new Error('Missing OAuth callback template.');
  }
  const isSuccess = status === 'success';
  return template
    .replaceAll('{{status}}', status)
    .replaceAll('{{ title }}', escapeHtml(title))
    .replaceAll('{{ message }}', escapeHtml(message))
    .replaceAll('{{ badge }}', isSuccess ? 'Connected' : 'Error');
}

export default defineHandler(async (event) => {
  const url = getRequestURL(event);
  if (url.pathname !== '/mcp/oauth/callback') {
    event.res.status = 404;
    return;
  }

  const query = getQuery(event);
  const code = typeof query.code === 'string' ? query.code : null;
  const oauthError = typeof query.error === 'string' ? query.error : null;
  const state = typeof query.state === 'string' ? query.state : null;

  event.res.headers.set('content-type', 'text/html; charset=utf-8');

  if (oauthError) {
    event.res.status = 400;
    return renderPage({
      message: oauthError,
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  if (!(code && state)) {
    event.res.status = 400;
    return renderPage({
      message: 'Missing OAuth code or state.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  const parsedState = parseMCPOAuthState({
    secret: env.MCP_ENCRYPTION_KEY,
    state,
  });
  if (!parsedState) {
    event.res.status = 400;
    return renderPage({
      message: 'OAuth state was invalid.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  const [server, connection] = await Promise.all([
    getMCPServerById({
      id: parsedState.serverId,
      userId: parsedState.userId,
    }),
    getMCPOAuthConnection({
      serverId: parsedState.serverId,
      userId: parsedState.userId,
    }),
  ]);

  if (!(server && connection)) {
    event.res.status = 404;
    return renderPage({
      message: 'MCP server or OAuth connection was not found.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  try {
    const authProvider = createMCPOAuthCallbackProvider({ connection, server });
    await auth(authProvider, {
      authorizationCode: code,
      callbackState: state,
      fetchFn: guardedFetch,
      serverUrl: server.url,
    });
    const client = await createMCPClient({
      clientName: 'gorkie',
      transport: {
        authProvider,
        fetch: guardedFetch,
        redirect: 'error',
        type: server.transport === 'sse' ? 'sse' : 'http',
        url: server.url,
      },
    });
    try {
      const definitions = await client.listTools();
      await ensureMCPToolModes({
        defaultMode: mcp.defaultToolMode,
        serverId: server.id,
        toolNames: definitions.tools.map((definition) => definition.name),
        userId: server.userId,
      });
    } finally {
      await client.close().catch(() => undefined);
    }
    await updateMCPServer({
      id: server.id,
      userId: server.userId,
      values: {
        enabled: true,
        lastConnectedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    await deleteMCPConnections({ serverId: server.id, userId: server.userId });
    await updateMCPServer({
      id: server.id,
      userId: server.userId,
      values: {
        enabled: false,
        lastError: error instanceof Error ? error.message : 'OAuth failed',
      },
    });
    event.res.status = 400;
    return renderPage({
      message:
        'Could not complete OAuth. Return to Slack App Home and try again.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  return renderPage({
    message: 'You can close this tab and go back to Slack.',
    status: 'success',
    title: 'MCP Connected',
  });
});
