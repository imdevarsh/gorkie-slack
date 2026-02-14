import { env } from '~/env';

export const messageThreshold = 10;

export const runtimeConfig = {
  sandboxTimeoutMinutes: 30,
  pausedTtlMinutes: 180,
  cleanupIntervalMs: 5 * 60 * 1000,
  sandboxCreationTimeoutSeconds: 180,
  resumeHealthTimeoutMs: 120_000,
  daytona: {
    apiKey: env.DAYTONA_API_KEY,
    apiUrl: env.DAYTONA_API_URL,
    target: env.DAYTONA_TARGET,
    snapshot: env.DAYTONA_SNAPSHOT,
  },
  opencode: {
    provider: 'openrouter',
    apiKey: env.OPENROUTER_API_KEY,
    openrouterBaseUrl: env.OPENCODE_OPENROUTER_BASE_URL,
    model: env.OPENCODE_MODEL,
    githubToken: env.GITHUB_TOKEN?.trim() ?? '',
  },
  attachments: {
    maxBytes: 1_000_000_000,
    directory: 'attachments',
  },
  output: {
    maxLines: 2000,
    maxBytes: 50 * 1024,
    directory: 'output/.tool-output',
    sessionLogFile: 'session.jsonl',
  },
} as const;
