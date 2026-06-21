import type { Thread } from 'chat';

export interface SlackThread {
  channel: string;
  threadTs: string;
}

export function getThread(thread: Thread): SlackThread | undefined {
  const [adapter, channel, threadTs] = thread.id.split(':');
  if (adapter !== 'slack' || !(channel && threadTs)) {
    return;
  }
  return { channel, threadTs };
}
