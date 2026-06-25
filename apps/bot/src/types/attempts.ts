import type { PiAttempt } from '@repo/ai';

export interface AttemptFailure {
  attempt: PiAttempt;
  error: unknown;
}
