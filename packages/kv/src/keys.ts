import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      REDIS_URL: z.string().min(1).optional(),
    },
    runtimeEnv: {
      REDIS_URL: process.env.REDIS_URL,
    },
    emptyStringAsUndefined: true,
  });
