import { defineHandler } from 'nitro';
import { env } from '@/env';

const ALLOW_METHODS = 'DELETE,GET,OPTIONS,PATCH,POST,PUT';
const ALLOW_HEADERS = 'Authorization,Content-Type';

export default defineHandler((event) => {
  event.res.headers.set('Access-Control-Allow-Origin', env.CORS_ORIGIN);
  event.res.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  event.res.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);

  if (event.req.method === 'OPTIONS') {
    event.res.status = 204;
    return '';
  }

  return;
});
