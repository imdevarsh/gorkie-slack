import type { PiAttempt } from '@repo/ai';
import type { AttemptFailure } from '@/types/attempts';

export function nextAttempt({
  attempts,
  failures,
}: {
  attempts: PiAttempt[];
  failures: AttemptFailure[];
}): PiAttempt | undefined {
  return attempts.find(
    (attempt) =>
      !failures.some(
        (failure) =>
          failure.attempt.provider === attempt.provider &&
          failure.attempt.model === attempt.model
      )
  );
}
