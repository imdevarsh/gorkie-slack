interface AssistantErrorMessage {
  errorMessage?: string;
  role: string;
  stopReason?: string;
}

const RETRY_MARKERS = [
  'connection error',
  'connection lost',
  'connection refused',
  'ended without',
  'fetch failed',
  'http2 request did not get a response',
  'network error',
  'overloaded',
  'other side closed',
  'provider returned error',
  'rate limit',
  'reset before headers',
  'socket hang up',
  'stream ended before message_stop',
  'too many requests',
  'terminated',
  'upstream connect',
  'websocket closed',
  'websocket error',
  'server error',
  'internal error',
  'service unavailable',
  'timed out',
  'timeout',
  'retry delay',
];

export function isRetryableError(message: AssistantErrorMessage): boolean {
  const text = message.errorMessage?.toLowerCase();
  if (
    message.role !== 'assistant' ||
    message.stopReason !== 'error' ||
    typeof text !== 'string'
  ) {
    return false;
  }

  let status = '';
  for (const char of text) {
    if (char >= '0' && char <= '9') {
      status += char;
      continue;
    }
    if (status) {
      const code = Number(status);
      if (code === 429 || (code >= 500 && code < 600)) {
        return true;
      }
      status = '';
    }
  }

  if (status) {
    const code = Number(status);
    if (code === 429 || (code >= 500 && code < 600)) {
      return true;
    }
  }

  return RETRY_MARKERS.some((marker) => text.includes(marker));
}
