import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
      OPENROUTER_API_KEY: z.string().min(1).startsWith('sk-'),
      OPENROUTER_BASE_URL: z.url().optional(),
      INFERENCE_API_KEY: z.string().min(1).startsWith('sk-').optional(),
      INFERENCE_BASE_URL: z.url().optional(),
      GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: {
      HACKCLUB_API_KEY: process.env.HACKCLUB_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
      INFERENCE_API_KEY: process.env.INFERENCE_API_KEY,
      INFERENCE_BASE_URL: process.env.INFERENCE_BASE_URL,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    },
    emptyStringAsUndefined: true,
  });
