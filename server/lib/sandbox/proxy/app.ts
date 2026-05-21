import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import { validateToken } from './tokens';

interface ProviderEntry {
  apiKey: string;
  baseUrl: string;
}

const ENV_KEYS: Record<string, string | undefined> = {
  hackclub: env.HACKCLUB_API_KEY,
  openrouter: env.OPENROUTER_API_KEY,
  gemini: env.GOOGLE_GENERATIVE_AI_API_KEY,
};

const ENV_BASE_URLS: Record<string, string | undefined> = {
  openrouter: env.OPENROUTER_BASE_URL,
};

const staticModels = JSON.parse(
  readFileSync(new URL('../config/models.json', import.meta.url), 'utf8')
) as { providers: Record<string, { baseUrl?: string }> };

const PROVIDERS: Record<string, ProviderEntry> = {};
for (const { provider } of config.modelChain) {
  if (provider in PROVIDERS) {
    continue;
  }
  const baseUrl =
    ENV_BASE_URLS[provider] ?? staticModels.providers[provider]?.baseUrl;
  const apiKey = ENV_KEYS[provider];
  if (baseUrl && apiKey) {
    PROVIDERS[provider] = { baseUrl, apiKey };
  }
}

export const proxyApp = new Hono().all('/:provider/*', async (c) => {
  const bearer = c.req.header('Authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null;

  if (!token) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  if (!(await validateToken(token))) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const provider = c.req.param('provider');
  const entry = PROVIDERS[provider];

  if (!entry) {
    return c.json({ error: `Unknown provider: ${provider}` }, 400);
  }

  const path = c.req.path.slice(1 + provider.length);
  const upstream = `${entry.baseUrl}${path}${new URL(c.req.url).search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.set('Authorization', `Bearer ${entry.apiKey}`);
  headers.delete('host');

  const upstreamRes = await fetch(upstream, {
    method: c.req.method,
    headers,
    body:
      c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? c.req.raw.body
        : undefined,
    duplex: 'half',
  }).catch((err: unknown) => {
    logger.error({ err, provider }, '[proxy] upstream fetch failed');
    throw err;
  });

  logger.debug(
    { provider, path, status: upstreamRes.status },
    '[proxy] forwarded'
  );

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: upstreamRes.headers,
  });
});

export type ProxyApp = typeof proxyApp;
