export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  sandbox: { ttl: 10 * 60 },
  snapshot: { ttl: 24 * 60 * 60 },
  keep: ['attachments', 'output', 'agent'] as const,
};
