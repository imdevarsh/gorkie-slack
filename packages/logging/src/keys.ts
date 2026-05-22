import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      LOG_DIRECTORY: z.string().default('logs'),
    },
    runtimeEnv: {
      LOG_LEVEL: process.env.LOG_LEVEL,
      LOG_DIRECTORY: process.env.LOG_DIRECTORY,
    },
    emptyStringAsUndefined: true,
  });
