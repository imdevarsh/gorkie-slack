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
    PORT: z.coerce.number().default(3001),
    CORS_ORIGIN: z.url(),
    HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.url().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
