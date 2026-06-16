import { isRetryable, type PiAttempt, retryDelayMs } from '@repo/ai';

export interface AttemptFailure {
  attempt: PiAttempt;
  error: unknown;
}

function attemptKey(attempt: PiAttempt): string {
  return `${attempt.provider}:${attempt.model}`;
}

export function sameAttempt(a: PiAttempt, b: PiAttempt): boolean {
  return attemptKey(a) === attemptKey(b);
}

export function nextAttempt({
  attempts,
  error,
  failures,
}: {
  attempts: PiAttempt[];
  error: unknown;
  failures: AttemptFailure[];
}): PiAttempt | undefined {
  if (!isRetryable(error)) {
    return;
  }
  return attempts.find(
    (attempt) =>
      failures.filter((failure) => sameAttempt(failure.attempt, attempt))
        .length < attempt.retries
  );
}

export function attemptDelayMs({
  attempt,
  error,
  failures,
}: {
  attempt: PiAttempt;
  error: unknown;
  failures: AttemptFailure[];
}): number {
  if (!attempt.delayMs) {
    return 0;
  }
  const attemptCount = failures.filter((failure) =>
    sameAttempt(failure.attempt, attempt)
  ).length;
  const backoffFactor = Math.max(attempt.backoffFactor ?? 1, 1);
  const backoffDelayMs = attempt.delayMs * backoffFactor ** (attemptCount - 1);
  return Math.max(backoffDelayMs, retryDelayMs(error) ?? 0);
}
