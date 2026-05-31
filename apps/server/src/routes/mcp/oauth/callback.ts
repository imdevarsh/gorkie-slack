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

function html({
  message,
  status,
  title,
}: {
  message: string;
  status: 'error' | 'success';
  title: string;
}): string {
  const accent = status === 'success' ? '#2563eb' : '#dc2626';
  const icon = status === 'success' ? 'Connected' : 'Error';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif}
main{width:min(520px,calc(100vw - 32px));background:white;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 50px rgb(15 23 42 / .12);padding:32px}
.badge{display:inline-flex;align-items:center;gap:8px;color:${accent};font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.04em}
.dot{width:10px;height:10px;border-radius:999px;background:${accent}}
h1{margin:14px 0 10px;font-size:32px;line-height:1.15}
p{margin:0;color:#4b5563;font-size:16px;line-height:1.6}
</style>
</head>
<body>
<main>
<div class="badge"><span class="dot"></span>${icon}</div>
<h1>${title}</h1>
<p>${message}</p>
</main>
</body>
</html>`;
}

export default defineHandler(async (event) => {
  const query = getQuery(event);
  const code = typeof query.code === 'string' ? query.code : null;
  const state = typeof query.state === 'string' ? query.state : null;
  const oauthError = typeof query.error === 'string' ? query.error : null;

  event.res.headers.set('content-type', 'text/html; charset=utf-8');

  if (oauthError) {
    event.res.status = 400;
    return html({
      message: oauthError,
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  if (!(code && state)) {
    event.res.status = 400;
    return html({
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
    return html({
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
    return html({
      message: 'MCP server or OAuth connection was not found.',
      status: 'error',
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
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  return html({
    message:
      'This MCP server is connected to Gorkie. You can close this tab and refresh status in Slack.',
    status: 'success',
    title: 'Connected to Gorkie',
  });
});
