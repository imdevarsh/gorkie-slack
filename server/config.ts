export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  sandboxTtlSeconds: 10 * 60,
  snapshotTtlSeconds: 24 * 60 * 60,
  keep: ['attachments'] as const,
  maxOutputLength: 16_000,
};
