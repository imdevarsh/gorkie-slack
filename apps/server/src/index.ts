import { createLogger, type Logger } from '@repo/logging/log';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';
import { env } from './env';
import { proxyApp } from './proxy/app';

const logger: Logger = await createLogger({
  logLevel: env.LOG_LEVEL,
  logDirectory: env.LOG_DIRECTORY,
});

const app = new Hono();

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
  logger.error({ path: c.req.path, error }, 'unhandled error');
  return c.json({ message: 'Internal Server Error', status: 500 }, 500);
});

export default app;
