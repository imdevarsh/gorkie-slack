const RETRYABLE_STATUSES = new Set([402, 408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60_000;

const RETRYABLE_PATTERN =
  /\b(402|408|409|429|500|502|503|504)\b|gateway|timeout|rate.?limit|max_tokens|insufficient credits|requires more credits|out of .*credits|resource_exhausted|econnreset|etimedout|unavailable/i;

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

export function retryDelayMs(error: unknown): number | undefined {
  const message = messageOf(error);
  const retryDelay = message.match(
    /retryDelay\\?"?\s*:\s*\\?"?(\d+(?:\.\d+)?)s/i
  );
  if (retryDelay?.[1]) {
    return Math.min(
      Math.ceil(Number(retryDelay[1]) * 1000),
      MAX_RETRY_AFTER_MS
    );
  }
  const retryIn = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (retryIn?.[1]) {
    return Math.min(Math.ceil(Number(retryIn[1]) * 1000), MAX_RETRY_AFTER_MS);
  }
  return;
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return RETRYABLE_STATUSES.has(status);
  }
  return RETRYABLE_PATTERN.test(messageOf(error));
}
