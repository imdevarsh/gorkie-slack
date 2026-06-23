import { errorMessage } from '@/lib/utils/error';

const CREDIT_ERROR_PATTERN =
  /\b(credit|credits|quota|daily limit|requires more credits)\b/i;
const CONTEXT_ERROR_PATTERN =
  /\b(max_tokens|maximum context|context length|too many tokens)\b/i;

export type AgentErrorStage = 'after_progress' | 'after_text' | 'before_output';

export function agentErrorMessage({
  error,
  stage = 'before_output',
}: {
  error: unknown;
  stage?: AgentErrorStage;
}): string {
  const message = errorMessage(error);
  if (stage === 'after_text') {
    return '_gorkie hit an error after it had already started responding. the reply above may be partial; send a follow-up and gorkie can continue from the current thread state._';
  }
  if (stage === 'after_progress') {
    return '_gorkie hit an error after it had already shown progress. the task rows above show what completed; send a follow-up and gorkie can continue from the current thread state._';
  }
  if (CREDIT_ERROR_PATTERN.test(message)) {
    return '_gorkie is out of model credits for this request. try again later or ask for a shorter/smaller result._';
  }
  if (CONTEXT_ERROR_PATTERN.test(message)) {
    return '_that request is too large for the current model budget. try a shorter prompt or ask me to compact/summarize first._';
  }
  return '_oops, something went wrong._';
}
