import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      LOG_DIRECTORY: z.string().default("logs"),
      LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    },
    runtimeEnv: {
      LOG_DIRECTORY: process.env.LOG_DIRECTORY,
      LOG_LEVEL: process.env.LOG_LEVEL,
    },
    emptyStringAsUndefined: true,
  });
