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
    // Modal Sandbox
    MODAL_TOKEN_ID: z.string().optional(),
    MODAL_TOKEN_SECRET: z.string().optional(),
    MODAL_ENVIRONMENT: z.string().optional(),
    MODAL_APP_NAME: z.string().optional().default('gorkie-slack-sandbox'),
    MODAL_BASE_IMAGE: z.string().optional().default('ubuntu:22.04'),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
