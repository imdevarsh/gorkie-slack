import { env } from '~/env';

export const messageThreshold = 10;

export const sandbox = {
  timeouts: {
    stopMinutes: 5,
    archiveMinutes: 60,
    deleteMinutes: 2 * 24 * 60,
    healthMs: 60_000,
  },
  rpc: {
    operationTimeoutMs: 60_000,
    startupTimeoutMs: 20_000,
  },
  toolOutput: {
    detailsMaxChars: 180,
    titleMaxChars: 60,
    outputMaxChars: 260,
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
  },
};
