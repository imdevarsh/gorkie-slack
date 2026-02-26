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
    commandTimeoutMs: 30_000,
    startupTimeoutMs: 2 * 60 * 1000,
  },
  toolOutput: {
    detailsMaxChars: 180,
    titleMaxChars: 60,
    outputMaxChars: 260,
  },
  runtime: {
    agentPort: 3000,
    workdir: '/home/daytona',
    executionTimeoutMs: 20 * 60 * 1000,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
  daytona: {
    apiKey: env.DAYTONA_API_KEY,
    apiUrl: env.DAYTONA_API_URL,
    target: env.DAYTONA_TARGET,
    startTimeoutSeconds: 5 * 60, // Max wait for sandbox to start / unarchive
  },
};
