import { isRetryable, type PiAttempt } from '@repo/ai';

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
  return attempts.find(
    (attempt) =>
      !failures.some(
        (failure) =>
          failure.attempt.provider === attempt.provider &&
          failure.attempt.model === attempt.model
      )
  );
}
