import 'dotenv/config';
import { keys as database } from '@repo/db/keys';
import { keys as logging } from '@repo/logging/keys';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  extends: [database(), logging()],
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(8000),
    CORS_ORIGIN: z.string().min(1),
    MCP_ENCRYPTION_KEY: z.string().min(32),
    SERVER_BASE_URL: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
