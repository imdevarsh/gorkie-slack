import "dotenv/config";
import { keys as core } from "@repo/env/keys/core";
import { keys as database } from "@repo/env/keys/database";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  extends: [core(), database()],
  server: {
    CORS_ORIGIN: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
