import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      HACKCLUB_API_KEY: z.string().min(1).startsWith("sk-hc-"),
      OPENROUTER_API_KEY: z.string().min(1).startsWith("sk-"),
      OPENROUTER_BASE_URL: z.url().optional(),
      GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
  });
