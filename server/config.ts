export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  ttl: 10 * 60,
  attachments: {
    maxBytes: 1_000_000_000,
  },
  snapshot: { ttl: 24 * 60 * 60 },
};

export const tools = {
  bash: {
    maxOutputLines: 2000,
    maxOutputBytes: 50 * 1024,
  },
};
