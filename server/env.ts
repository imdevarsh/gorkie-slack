import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  extends: [],
  shared: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
  },
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
    // Database
    DATABASE_URL: z.string().url(),
    // AI
    HACKCLUB_API_KEY: z.string().min(1).startsWith('sk-hc-'),
    OPENROUTER_API_KEY: z.string().min(1).startsWith('sk-'),
    OPENROUTER_BASE_URL: z.string().url().optional(),
    // Logging
    LOG_DIRECTORY: z.string().optional().default('logs'),
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .optional()
      .default('info'),
    // Admins (comma-separated Slack user IDs)
    ADMIN_IDS: z.string().optional(),
    // Exa
    EXA_API_KEY: z.string().min(1),
    // E2B
    E2B_API_KEY: z.string().min(1),
    // Sandbox
    AGENTMAIL_API_KEY: z.string().min(1).startsWith('am_'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
