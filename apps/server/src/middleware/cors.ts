import { defineHandler } from 'nitro/h3';
import { env } from '@/env';

const ALLOW_METHODS = 'DELETE,GET,OPTIONS,PATCH,POST,PUT';
const FALLBACK_ALLOW_HEADERS = 'Authorization,Content-Type';
const MAX_AGE_SECONDS = '86400';

export default defineHandler((event) => {
  event.res.headers.set('Access-Control-Allow-Origin', env.CORS_ORIGIN);
  event.res.headers.set('Access-Control-Allow-Credentials', 'true');
  event.res.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);

  const requestedHeaders = event.req.headers.get(
    'access-control-request-headers'
  );
  event.res.headers.set(
    'Access-Control-Allow-Headers',
    requestedHeaders ?? FALLBACK_ALLOW_HEADERS
  );
  event.res.headers.set('Access-Control-Max-Age', MAX_AGE_SECONDS);

  if (event.req.method === 'OPTIONS') {
    event.res.status = 204;
    return '';
  }

  return;
});
