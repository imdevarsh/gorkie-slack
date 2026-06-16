// Statuses worth retrying at all (transient infra + provider credit/quota).
const RETRYABLE_STATUSES = new Set([402, 408, 409, 429, 500, 502, 503, 504]);
// Subset safe to retry on the SAME provider — credit/quota (402/429) are not,
// they need a different provider.
const TRANSIENT_STATUSES = new Set([408, 500, 502, 503, 504]);

const RETRYABLE_PATTERN =
  /\b(402|408|409|429|500|502|503|504)\b|gateway|timeout|rate.?limit|max_tokens|insufficient credits|requires more credits|out of .*credits|resource_exhausted|econnreset|etimedout|unavailable/i;
const TRANSIENT_PATTERN =
  /\b(408|500|502|503|504)\b|gateway|timeout|econnreset|etimedout|unavailable/i;
const QUOTA_PATTERN =
  /\b(402|429)\b|quota|rate.?limit|insufficient credits|requires more credits|out of .*credits|resource_exhausted/i;

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

// Should we retry this turn at all (same model or next provider)?
export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return RETRYABLE_STATUSES.has(status);
  }
  return RETRYABLE_PATTERN.test(messageOf(error));
}

// Is it safe to retry on the SAME provider/model (transient blip), vs. having to
// move to the next provider (credit/quota exhaustion)?
export function isRetryableSameAttempt(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return TRANSIENT_STATUSES.has(status);
  }
  const message = messageOf(error);
  if (QUOTA_PATTERN.test(message)) {
    return false;
  }
  return TRANSIENT_PATTERN.test(message);
}
