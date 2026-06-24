import 'dotenv/config';
import { keys as ai } from '@repo/ai/keys';
import { keys as database } from '@repo/db/keys';
import { keys as logging } from '@repo/logging/keys';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  extends: [ai(), database(), logging()],
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_APP_TOKEN: z.string().optional(),
    // User OAuth token (xoxp-) used to post AS the owner. Only ever applied when
    // the turn was triggered by OWNER_USER_ID; see the sendAsUser tool.
    SLACK_USER_TOKEN: z.string().optional(),
    // Slack user id allowed to send messages as themselves via SLACK_USER_TOKEN.
    OWNER_USER_ID: z.string().optional(),
    PORT: z.coerce.number().default(3000),
    OPT_IN_CHANNEL: z.string().optional(),
    AUTO_ADD_CHANNEL: z.string().optional(),

    // Static site hosting (see lib/sites). The host only ever serves prebuilt
    // static files from SITES_ROOT — it never executes site code. Building and
    // testing happen exclusively in the E2B sandbox.
    SITES_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    SITES_PORT: z.coerce.number().default(443),
    SITES_ROOT: z.string().default('/var/gorkiesites'),
    // Public host (and optional :port) used to build site URLs returned to the
    // agent, e.g. "example.com" or "203.0.113.4". Path is /gorkiesites/<name>/.
    SITES_PUBLIC_HOST: z.string().optional(),

    E2B_API_KEY: z.string().min(1),

    LANGFUSE_BASEURL: z.url().optional(),
    LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
    LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
