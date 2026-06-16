export function isRetryableProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(402|429|500|502|503|504)\b|gateway|timeout|rate limit|max_tokens|insufficient credits|requires more credits|out of .*credits|econnreset|etimedout/i.test(
    message
  );
}

export function isRetryableSameAttempt(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /\b(402|429)\b|quota|rate limit|insufficient credits|requires more credits|out of .*credits|resource_exhausted/i.test(
      message
    )
  ) {
    return false;
  }
  return /\b(500|502|503|504)\b|gateway|timeout|econnreset|etimedout|unavailable/i.test(
    message
  );
}
