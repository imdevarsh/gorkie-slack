export const messageThreshold = 10;

export const sandbox = {
  runtime: 'node22' as const,
  timeoutMs: 10 * 60 * 1000,
  sandboxTtlSeconds: 10 * 60,
  snapshotTtlSeconds: 7 * 24 * 60 * 60,
};

export const loadingMessages = [
  'is pondering your question',
  'is working on it',
  'is putting thoughts together',
  'is mulling this over',
  'is figuring this out',
  'is cooking up a response',
  'is connecting the dots',
  'is working through this',
  'is piecing things together',
  'is giving it a good think',
];