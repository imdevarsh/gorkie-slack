import { validateProxyToken } from '@repo/db/queries';
import { defineHandler, getRequestIP } from 'nitro/h3';
import { providers } from '@/config';
import logger from '@/utils/logger';

function getBearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export default defineHandler(async (event) => {
  const provider = event.context.params?.provider;
  const entry = provider ? providers[provider] : undefined;
  if (!(provider && entry)) {
    logger.warn({ provider }, '[proxy] unknown provider');
    event.res.status = 400;
    return {
      message: `Unknown provider: ${provider ?? 'unknown'}`,
      status: 400,
    };
  }

  const requestIp = getRequestIP(event, { xForwardedFor: true }) ?? null;
  const token = getBearerToken(event.req.headers.get('authorization'));
  const session = token ? await validateProxyToken(token, requestIp) : null;
  if (!session) {
    logger.warn({ provider, requestIp }, '[proxy] unauthorized request');
    event.res.status = 401;
    return { message: 'Unauthorized', status: 401 };
  }

  const requestUrl = new URL(event.req.url);
  const upstreamPath = requestUrl.pathname.slice(1 + provider.length);
  const headers = new Headers(event.req.headers);
  headers.set('Authorization', `Bearer ${entry.apiKey}`);
  headers.set('Accept-Encoding', 'identity');
  headers.delete('host');

  const upstreamInit: RequestInit & { duplex?: 'half' } = {
    body:
      event.req.method === 'GET' || event.req.method === 'HEAD'
        ? undefined
        : event.req.body,
    duplex: 'half',
    headers,
    method: event.req.method,
  };

  const upstreamResponse = await fetch(
    `${entry.url}${upstreamPath}${requestUrl.search}`,
    upstreamInit
  ).catch((error: unknown) => {
    logger.error(
      { err: error, provider, sandboxId: session.sandboxId },
      '[proxy] upstream fetch failed'
    );
    return null;
  });

  if (!upstreamResponse) {
    event.res.status = 502;
    return { message: 'Upstream fetch failed', status: 502 };
  }

  return upstreamResponse;
});
