import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      LANGFUSE_BASEURL: z.url().optional(),
      LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
      LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
      LOG_DIRECTORY: z.string().default("logs"),
      LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    },
    runtimeEnv: {
      LANGFUSE_BASEURL: process.env.LANGFUSE_BASEURL,
      LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
      LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
      LOG_DIRECTORY: process.env.LOG_DIRECTORY,
      LOG_LEVEL: process.env.LOG_LEVEL,
    },
    emptyStringAsUndefined: true,
  });
