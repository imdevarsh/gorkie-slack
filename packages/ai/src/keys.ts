import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
      GEMINI_API_KEY: z.string().min(1).optional(),
      OPENROUTER_API_KEY: z.string().min(1).optional(),
      OPENROUTER_BASE_URL: z.url().optional(),
      EXA_API_KEY: z.string().min(1),
    },
    runtimeEnv: {
      HACKCLUB_API_KEY: process.env.HACKCLUB_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
      EXA_API_KEY: process.env.EXA_API_KEY,
    },
    emptyStringAsUndefined: true,
  });
