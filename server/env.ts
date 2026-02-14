import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  extends: [],
  server: {
    // Slack
    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_APP_TOKEN: z.string().optional(),
    SLACK_SOCKET_MODE: z.coerce.boolean().optional().default(false),
    PORT: z.coerce.number().default(3000),
    // Channel to add user to automatically
    AUTO_ADD_CHANNEL: z.string().optional(),
    // Channel required for usage
    OPT_IN_CHANNEL: z.string().optional(),
    // Redis
    REDIS_URL: z.string().min(1),
    // AI
    OPENROUTER_API_KEY: z.string().min(1).startsWith('sk-or-'),
    HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
    // Logging
    LOG_DIRECTORY: z.string().optional().default('logs'),
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .optional()
      .default('info'),
    // Exa
    EXA_API_KEY: z.string().min(1),
    // Daytona Sandbox
    DAYTONA_API_KEY: z.string().min(1),
    DAYTONA_API_URL: z.string().url().optional(),
    DAYTONA_TARGET: z.string().optional(),
    DAYTONA_SNAPSHOT: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
