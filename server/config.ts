export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  sandboxTtlSeconds: 10 * 60,
  snapshotTtlSeconds: 7 * 24 * 60 * 60,
};
