import "dotenv/config";
import { keys as core } from "@repo/env/keys/core";
import { keys as database } from "@repo/env/keys/database";
import { keys as slack } from "@repo/env/keys/slack";
import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
  extends: [core(), database(), slack()],
  server: {},
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
