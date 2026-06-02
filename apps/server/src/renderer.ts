import { auth } from '@ai-sdk/mcp';
import {
  getMcpOAuthConnection,
  getMcpServerByIdForUser,
  updateMcpServerForUser,
} from '@repo/db/queries';
import { createGuardedFetch, parseMcpOAuthState } from '@repo/utils';
import escapeHtml from 'escape-html';
import { defineHandler, getQuery, getRequestURL } from 'nitro/h3';
import { useStorage } from 'nitro/storage';
import { z } from 'zod';
import { env } from '@/env';
import { createMcpOAuthProvider } from '@/utils/mcp-oauth-provider';

const querySchema = z.looseObject({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const guardedFetch = Object.assign(
  createGuardedFetch({
    maxResponseBytes: 10 * 1024 * 1024,
    timeoutMs: 15_000,
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
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{message}}', escapeHtml(message))
    .replaceAll('{{badge}}', isSuccess ? 'Connected' : 'Error');
}

export default defineHandler(async (event) => {
  const url = getRequestURL(event);
  if (url.pathname !== '/mcp/oauth/callback') {
    event.res.status = 404;
    return;
  }

  const parsed = querySchema.parse(getQuery(event));
  const code = parsed.code ?? null;
  const oauthError = parsed.error ?? null;
  const state = parsed.state ?? null;

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

  const parsedState = parseMcpOAuthState({
    secret: env.MCP_TOKEN_ENCRYPTION_KEY,
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
    return renderPage({
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
    title: 'Connected to Gorkie',
  });
});
