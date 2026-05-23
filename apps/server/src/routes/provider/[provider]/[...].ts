import { validateProxyToken } from '@repo/db/queries';
import { defineHandler, getRequestIP, getRequestURL } from 'nitro/h3';
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
  const start = Date.now();
  const provider = event.context.params?.provider;
  const entry = provider ? providers[provider] : undefined;
  if (!(provider && entry)) {
    logger.warn(
      {
        provider: provider ?? 'unknown',
        ip: getRequestIP(event, { xForwardedFor: true }),
      },
      '[proxy] unknown provider'
    );
    event.res.status = 400;
    return {
      message: `Unknown provider: ${provider ?? 'unknown'}`,
      status: 400,
    };
  }

  const requestIp = getRequestIP(event, { xForwardedFor: true }) ?? null;
  const token = getBearerToken(event.req.headers.get('authorization'));
  const session = await (token
    ? validateProxyToken(token, requestIp)
    : Promise.resolve(null)
  ).catch((error: unknown) => {
    logger.error(
      { err: error, provider, ip: requestIp },
      '[proxy] token validation failed'
    );
    return null;
  });
  if (!session) {
    logger.warn({ provider, ip: requestIp }, '[proxy] unauthorized request');
    event.res.status = 401;
    return { message: 'Unauthorized', status: 401 };
  }

  const requestUrl = getRequestURL(event);
  const upstreamPath = requestUrl.pathname.slice(
    '/provider/'.length + provider.length
  );
  const upstreamUrl = `${entry.url}${upstreamPath}${requestUrl.search}`;

  logger.info(
    {
      provider,
      sandboxId: session.sandboxId,
      method: event.req.method,
      path: upstreamPath,
      ip: requestIp,
    },
    '[proxy] request'
  );

  const headers = new Headers(event.req.headers);
  headers.set('Authorization', `Bearer ${entry.apiKey}`);
  headers.set('Accept-Encoding', 'identity');
  headers.delete('host');

  // Buffer the request body before forwarding. Passing event.req.body (a
  // ReadableStream) directly via duplex:'half' causes HackClub/OpenRouter to
  // return 500 — likely a framing or chunked-encoding issue introduced by the
  // Coder reverse-proxy layer. Buffering ensures a complete, well-formed body.
  const isBodyMethod =
    event.req.method !== 'GET' && event.req.method !== 'HEAD';
  const requestBody =
    isBodyMethod && event.req.body
      ? await new Response(event.req.body).text().catch(() => null)
      : null;

  const upstreamResponse = await fetch(upstreamUrl, {
    body: requestBody ?? undefined,
    headers,
    method: event.req.method,
    signal: AbortSignal.timeout(240_000),
  }).catch((error: unknown) => {
    logger.error(
      {
        err: error,
        provider,
        sandboxId: session.sandboxId,
        upstreamUrl,
        durationMs: Date.now() - start,
      },
      '[proxy] upstream fetch failed'
    );
    return null;
  });

  if (!upstreamResponse) {
    event.res.status = 502;
    return { message: 'Upstream fetch failed', status: 502 };
  }

  const durationMs = Date.now() - start;

  if (upstreamResponse.ok) {
    logger.info(
      {
        provider,
        sandboxId: session.sandboxId,
        status: upstreamResponse.status,
        path: upstreamPath,
        durationMs,
      },
      '[proxy] response'
    );
  } else {
    const errorBody = await upstreamResponse
      .clone()
      .text()
      .catch(() => '');
    logger.warn(
      {
        provider,
        sandboxId: session.sandboxId,
        status: upstreamResponse.status,
        path: upstreamPath,
        durationMs,
        errorBody: errorBody.slice(0, 500),
      },
      '[proxy] upstream error'
    );
  }

  return upstreamResponse;
});
