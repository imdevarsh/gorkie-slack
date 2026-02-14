import { env } from '~/env';

export const messageThreshold = 10;

export const sandbox = {
  timeoutMs: 10 * 60 * 1000,
  ttl: 10 * 60,
  autoStopMinutes: 5,
  autoArchiveMinutes: 60,
  // Keep sandboxes for 2 days, then hard-delete to control storage costs.
  // Bump to 7 days if users need longer-lived context.
  autoDeleteMinutes: 2 * 24 * 60,
  resources: {
    cpu: 2,
    memoryGiB: 4,
    diskGiB: 10,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
  daytona: {
    apiKey: env.DAYTONA_API_KEY,
    apiUrl: env.DAYTONA_API_URL,
    target: env.DAYTONA_TARGET,
    snapshot: env.DAYTONA_SNAPSHOT,
  },
};

export const tools = {
  bash: {
    maxOutputLines: 2000,
    maxOutputBytes: 50 * 1024,
  },
};
