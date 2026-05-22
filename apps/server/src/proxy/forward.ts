import { validateProxyToken } from '@repo/db/queries';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import type { AppVariables } from '../types.js';
import { providers } from './providers.js';

interface ProxyVariables extends AppVariables {
  requestIp: string | null;
  sandboxId: string;
}

function getRequestIp(request: Request): string | null {
  const h = request.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

const authSandbox = bearerAuth<{ Variables: ProxyVariables }>({
  verifyToken: async (token, c) => {
    const requestIp = getRequestIp(c.req.raw);
    const session = await validateProxyToken(token, requestIp);
    if (!session) {
      return false;
    }

    c.set('requestIp', requestIp);
    c.set('sandboxId', session.sandboxId);
    return true;
  },
});

export const forwardRoutes = new Hono<{ Variables: ProxyVariables }>().all(
  '/:provider/*',
  authSandbox,
  async (c) => {
    const provider = c.req.param('provider');
    const entry = providers[provider];
    if (!entry) {
      return c.json(
        { message: `Unknown provider: ${provider}`, status: 400 },
        400
      );
    }

    const requestUrl = new URL(c.req.url);
    const upstreamPath = c.req.path.slice(1 + provider.length);
    const headers = new Headers(c.req.raw.headers);
    headers.set('Authorization', `Bearer ${entry.apiKey}`);
    headers.set('Accept-Encoding', 'identity');
    headers.delete('host');

    const upstreamResponse = await fetch(
      `${entry.baseUrl}${upstreamPath}${requestUrl.search}`,
      {
        body:
          c.req.method === 'GET' || c.req.method === 'HEAD'
            ? undefined
            : c.req.raw.body,
        headers,
        method: c.req.method,
        // Bun requires this when forwarding a streaming request body.
        duplex: 'half',
      }
    ).catch((error: unknown) => {
      c.var.logger?.error(
        { err: error, provider, sandboxId: c.var.sandboxId },
        '[proxy] upstream fetch failed'
      );
      return null;
    });

    if (!upstreamResponse) {
      return c.json({ message: 'Upstream fetch failed', status: 502 }, 502);
    }

    return new Response(upstreamResponse.body, {
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
    });
  }
);
