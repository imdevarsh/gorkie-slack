import { errorMessage } from '@/lib/utils/error';

const CREDIT_ERROR_PATTERN =
  /\b(credit|credits|quota|daily limit|requires more credits)\b/i;
const CONTEXT_ERROR_PATTERN =
  /\b(max_tokens|maximum context|context length|too many tokens)\b/i;

export function agentErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (CREDIT_ERROR_PATTERN.test(message)) {
    return 'Gorkie is out of model credits for this request. Try again later or ask for a shorter/smaller result.';
  }
  if (CONTEXT_ERROR_PATTERN.test(message)) {
    return 'That request is too large for the current model budget. Try a shorter prompt or ask me to compact/summarize first.';
  }
  return 'Oops, something went wrong. Try again later.';
}
