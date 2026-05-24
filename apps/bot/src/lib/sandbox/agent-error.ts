import type { AgentSessionEvent } from '@/types/sandbox/rpc';

export function getAgentError(events: AgentSessionEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) {
      continue;
    }
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
      const err =
        'errorMessage' in message && typeof message.errorMessage === 'string'
          ? message.errorMessage.trim()
          : '';
      return err || 'Sandbox agent stopped with an error';
    }
    return null;
  }
  return null;
}
