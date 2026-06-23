const MINUTE_MS = 60 * 1000;

export const sandboxConfig = {
  template: 'gorkie-sandbox:3.0',
  workdir: '/home/user',
  timeoutMs: 10 * MINUTE_MS,
  executionTimeoutMs: 20 * MINUTE_MS,
};
