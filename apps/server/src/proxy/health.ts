import { Hono } from 'hono';
import { listProviders } from './providers.js';

function getClientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

export const healthRoutes = new Hono()
  .get('/health', (c) => c.json({ ok: true, providers: listProviders() }))
  .get('/ip', (c) => c.json({ ip: getClientIp(c.req.raw) }));
