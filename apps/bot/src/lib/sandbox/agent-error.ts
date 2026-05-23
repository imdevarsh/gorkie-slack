import type { AgentSessionEvent } from '@/types/sandbox/rpc';

export function agentFailed(events: AgentSessionEvent[]): boolean {
  for (const event of events) {
    if (event.type !== 'agent_end' || event.willRetry) {
      continue;
    }
    if (!Array.isArray(event.messages)) {
      continue;
    }
    for (const msg of event.messages) {
      if (
        msg &&
        typeof msg === 'object' &&
        'stopReason' in msg &&
        msg.stopReason === 'error'
      ) {
        return true;
      }
    }
  }
  return false;
}

export function getAgentError(events: AgentSessionEvent[]): string | null {
  // Check only the last non-retrying agent_end — earlier failures from model
  // fallbacks in the chain must not be treated as the final outcome.
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.type !== 'agent_end' || event.willRetry) {
      continue;
    }

    const messages = 'messages' in event ? event.messages : undefined;
    if (!Array.isArray(messages)) {
      return null;
    }

    for (const message of messages) {
      if (!(message && typeof message === 'object')) {
        continue;
      }
      if (!('stopReason' in message && message.stopReason === 'error')) {
        continue;
      }

      const errorMessage =
        'errorMessage' in message && typeof message.errorMessage === 'string'
          ? message.errorMessage.trim()
          : '';
      return errorMessage || 'Sandbox agent stopped with an error';
    }

    return null;
  }

  return null;
}
