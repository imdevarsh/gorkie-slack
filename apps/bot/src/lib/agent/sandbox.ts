import { E2BSandboxProvider } from '@repo/sandbox';
import { env } from '@/env';
import logger from '@/lib/logger';

export const sandbox = new E2BSandboxProvider({
  apiKey: env.E2B_API_KEY,
  env: {
    ...(env.AGENTMAIL_API_KEY
      ? { AGENTMAIL_API_KEY: env.AGENTMAIL_API_KEY }
      : {}),
  },
  logger,
});
