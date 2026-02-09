export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  redisTtlSeconds: 10 * 60,
};
