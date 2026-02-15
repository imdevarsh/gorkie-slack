import { env } from '~/env';

export const messageThreshold = 10;

export const sandbox = {
  timeoutMs: 10 * 60 * 1000,
  commandTimeoutMs: 120_000,
  paths: {
    workdir: '/home/user',
    attachments: '/home/user/attachments',
    output: '/home/user/output',
    turns: '/home/user/agent/turns',
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
  e2b: {
    apiKey: env.E2B_API_KEY,
    template: env.E2B_TEMPLATE,
  },
};
