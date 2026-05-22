import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';
import { env } from './env';
import logger from './lib/logger';
import { proxyApp } from './proxy/app';
import type { AppVariables } from './types';

const app = new Hono<{ Variables: AppVariables }>();

app.use(async (c, next) => {
  c.set('logger', logger);
  await next();
});
app.use(honoLogger((message) => logger.info(message)));
app.use(
  '/*',
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
    allowHeaders: ['Authorization', 'Content-Type'],
  })
);

app.get('/', (c) => c.json({ ok: true }));
app.route('/', proxyApp);

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  logger.error({ err: error, path: c.req.path }, 'unhandled error');
  return c.json({ message: 'Internal Server Error', status: 500 }, 500);
});

export default app;
