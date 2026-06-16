const RETRYABLE_STATUSES = new Set([402, 408, 409, 429, 500, 502, 503, 504]);
const SAME_PROVIDER_RETRYABLE_STATUSES = new Set([
  408, 409, 429, 500, 502, 503, 504,
]);

const RETRYABLE_PATTERN =
  /\b(402|408|409|429|500|502|503|504)\b|gateway|timeout|rate.?limit|max_tokens|insufficient credits|requires more credits|out of .*credits|resource_exhausted|econnreset|etimedout|unavailable/i;
const FALLBACK_ONLY_PATTERN =
  /\b402\b|insufficient credits|requires more credits|out of .*credits/i;

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const status = record.statusCode ?? record.status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return RETRYABLE_STATUSES.has(status);
  }
  return RETRYABLE_PATTERN.test(messageOf(error));
}

export function isSameProviderRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return SAME_PROVIDER_RETRYABLE_STATUSES.has(status);
  }
  const message = messageOf(error);
  return (
    RETRYABLE_PATTERN.test(message) && !FALLBACK_ONLY_PATTERN.test(message)
  );
}
