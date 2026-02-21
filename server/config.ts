export const messageThreshold = 10;

export const sandbox = {
  timeoutMs: 10 * 60 * 1000,
  commandTimeoutMs: 120_000,
  maxToolOutput: 20_000,
  autoDeleteAfterMs: 7 * 24 * 60 * 60 * 1000,
  janitorIntervalMs: 60 * 1000,
  paths: {
    workdir: '/home/user',
    attachments: '/home/user/attachments',
    output: '/home/user/output',
    turns: '/home/user/agent/turns',
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
};
