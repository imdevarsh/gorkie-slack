import { APICallError } from 'ai';

// 402 / out-of-credits: the same provider will keep failing, so only a fallback
// to a different provider helps.
const CREDIT_EXHAUSTED =
  /\b402\b|insufficient credits|requires more credits|out of .*credits/i;
// Transient signals, for errors a provider surfaced as a plain Error rather than
// an APICallError (the AI SDK classifies those itself via `isRetryable`).
const TRANSIENT =
  /\b(408|409|429|50[0-4])\b|gateway|timeout|rate.?limit|resource_exhausted|econnreset|etimedout|unavailable/i;
const MAX_CAUSE_DEPTH = 5;

// The harness wraps provider failures in a HarnessError, so the real error (with
// its statusCode / isRetryable) lives down the `cause` chain. Walk to it.
function rootError(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (APICallError.isInstance(current)) {
      return current;
    }
    if (current instanceof Error && current.cause !== undefined) {
      current = current.cause;
    } else {
      return current;
    }
  }
  return current;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFallbackOnly(error: unknown): boolean {
  const root = rootError(error);
  if (APICallError.isInstance(root) && root.statusCode === 402) {
    return true;
  }
  return CREDIT_EXHAUSTED.test(reason(root));
}

function isTransient(error: unknown): boolean {
  if (isFallbackOnly(error)) {
    return false;
  }
  const root = rootError(error);
  if (APICallError.isInstance(root)) {
    return root.isRetryable;
  }
  return TRANSIENT.test(reason(root));
}

export function isRetryable(error: unknown): boolean {
  return isTransient(error) || isFallbackOnly(error);
}
