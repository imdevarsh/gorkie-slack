const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const sandboxConfig = {
  template: 'gorkie-sandbox:3.0',
  workdir: '/home/user',
  timeoutMs: 10 * MINUTE_MS,
  executionTimeoutMs: 20 * MINUTE_MS,
  autoDeleteAfterMs: 7 * DAY_MS,
  janitorIntervalMs: MINUTE_MS,
} as const;
