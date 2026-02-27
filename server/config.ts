export const sandbox = {
  template: 'gorkie-sandbox:1.1.0',
  timeoutMs: 10 * 60 * 1000,
  autoDeleteAfterMs: 7 * 24 * 60 * 60 * 1000,
  janitorIntervalMs: 60 * 1000,
  rpc: {
    commandTimeoutMs: 60_000,
    startupTimeoutMs: 2 * 60 * 1000,
  },
  toolOutput: {
    detailsMaxChars: 180,
    titleMaxChars: 60,
    outputMaxChars: 260,
  },
  runtime: {
    workdir: '/home/user',
    executionTimeoutMs: 20 * 60 * 1000,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
};
