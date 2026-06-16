import { isRetryable, isSameProviderRetryable, type PiAttempt } from '@repo/ai';

export interface AttemptFailure {
  attempt: PiAttempt;
  error: unknown;
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
  const currentAttempt = failures.at(-1)?.attempt;
  const currentAttemptIndex = currentAttempt
    ? attempts.findIndex(
        (attempt) =>
          attempt.provider === currentAttempt.provider &&
          attempt.model === currentAttempt.model
      )
    : -1;

  if (currentAttempt && isSameProviderRetryable(error)) {
    const currentFailures = failures.filter(
      (failure) =>
        failure.attempt.provider === currentAttempt.provider &&
        failure.attempt.model === currentAttempt.model
    ).length;
    if (currentFailures < currentAttempt.retries) {
      return currentAttempt;
    }
  }

  return attempts
    .slice(currentAttemptIndex + 1)
    .find(
      (attempt) =>
        !failures.some(
          (failure) =>
            failure.attempt.provider === attempt.provider &&
            failure.attempt.model === attempt.model
        )
    );
}

export function attemptDelayMs({
  attempt,
  failures,
}: {
  attempt: PiAttempt;
  failures: AttemptFailure[];
}): number {
  if (!attempt.delayMs) {
    return 0;
  }
  const attemptCount = failures.filter(
    (failure) =>
      failure.attempt.provider === attempt.provider &&
      failure.attempt.model === attempt.model
  ).length;
  const backoffFactor = Math.max(attempt.backoffFactor ?? 1, 1);
  return attempt.delayMs * backoffFactor ** (attemptCount - 1);
}
