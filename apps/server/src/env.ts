import "dotenv/config";
import { keys as database } from "@repo/db/keys";
import { keys as observabilityKeys } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  extends: [database(), observabilityKeys()],
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    CORS_ORIGIN: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
