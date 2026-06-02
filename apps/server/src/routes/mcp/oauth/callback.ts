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

const guardedFetch = Object.assign(
  createGuardedFetch({
    maxResponseBytes: 10 * 1024 * 1024,
    timeoutMs: 15_000,
  }),
  { preconnect: fetch.preconnect }
);

function html({
  message,
  status,
  title,
}: {
  message: string;
  status: 'error' | 'success';
  title: string;
}): string {
  const isSuccess = status === 'success';
  const iconSvg = isSuccess
    ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="currentColor" opacity=".12"/><path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="currentColor" opacity=".12"/><path d="M10 6v4.5M10 13.5h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f5f7;
  --card:#ffffff;
  --border:rgba(0,0,0,.06);
  --shadow:0 2px 4px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.08);
  --text:#1d1d1f;
  --muted:#6e6e73;
  --accent:${isSuccess ? '#22c55e' : '#ef4444'};
  --accent-bg:${isSuccess ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)'};
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:#000000;
    --card:#1c1c1e;
    --border:rgba(255,255,255,.08);
    --shadow:0 2px 4px rgba(0,0,0,.4),0 8px 32px rgba(0,0,0,.6);
    --text:#f5f5f7;
    --muted:#98989f;
    --accent:${isSuccess ? '#4ade80' : '#f87171'};
    --accent-bg:${isSuccess ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)'};
  }
}
body{
  min-height:100dvh;
  display:grid;
  place-items:center;
  background:var(--bg);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;
  padding:24px;
  -webkit-font-smoothing:antialiased;
}
main{
  width:min(440px,100%);
  background:var(--card);
  border:1px solid var(--border);
  border-radius:20px;
  box-shadow:var(--shadow);
  padding:36px;
}
.badge{
  display:inline-flex;
  align-items:center;
  gap:7px;
  background:var(--accent-bg);
  color:var(--accent);
  font-size:12px;
  font-weight:600;
  letter-spacing:.04em;
  text-transform:uppercase;
  padding:5px 12px 5px 8px;
  border-radius:999px;
  margin-bottom:24px;
}
h1{
  font-size:26px;
  font-weight:700;
  letter-spacing:-.5px;
  line-height:1.2;
  margin-bottom:10px;
}
p{
  font-size:15px;
  line-height:1.6;
  color:var(--muted);
}
</style>
</head>
<body>
<main>
  <div class="badge">${iconSvg}${isSuccess ? 'Connected' : 'Error'}</div>
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
      message: oauthError
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
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
    return html({
      message:
        'Could not complete OAuth. Return to Slack App Home and try again.',
      status: 'error',
      title: 'MCP OAuth Failed',
    });
  }

  return html({
    message: 'You can close this tab and go back to Slack.',
    status: 'success',
    title: 'Connected to Gorkie',
  });
});
