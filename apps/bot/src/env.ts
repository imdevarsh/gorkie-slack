import "dotenv/config";
import { keys as aiKeys } from "@repo/ai/keys";
import { keys as databaseKeys } from "@repo/db/keys";
import { keys as observabilityKeys } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  extends: [aiKeys(), databaseKeys(), observabilityKeys()],
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_APP_TOKEN: z.string().optional(),
    SLACK_SOCKET_MODE: z.coerce.boolean().optional().default(false),
    PORT: z.coerce.number().default(3000),
    AUTO_ADD_CHANNEL: z.string().optional(),
    OPT_IN_CHANNEL: z.string().optional(),
    EXA_API_KEY: z.string().min(1),
    E2B_API_KEY: z.string().min(1),
    AGENTMAIL_API_KEY: z.string().min(1).startsWith("am_"),
    PROXY_BASE_URL: z.url(),
    PROXY_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
