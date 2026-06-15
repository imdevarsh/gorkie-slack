import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// Part-1: HackClub is the single shared model provider. OpenRouter / Google
// fallback keys return when multi-provider retry lands (a later phase).
export const keys = () =>
  createEnv({
    server: {
      HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
      EXA_API_KEY: z.string().min(1),
    },
    runtimeEnv: {
      HACKCLUB_API_KEY: process.env.HACKCLUB_API_KEY,
      EXA_API_KEY: process.env.EXA_API_KEY,
    },
    emptyStringAsUndefined: true,
  });
