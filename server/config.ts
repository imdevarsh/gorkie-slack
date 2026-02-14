import { env } from '~/env';

export const messageThreshold = 10;

export const sandbox = {
  timeouts: {
    stopMinutes: 5,
    archiveMinutes: 60,
    deleteMinutes: 2 * 24 * 60,
    healthMs: 60_000,
    previewTtlSeconds: 4 * 60 * 60,
  },
  runtime: {
    agentPort: 3000,
    workdir: '/home/daytona',
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
