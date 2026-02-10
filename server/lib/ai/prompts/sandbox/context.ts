import type { SlackMessageContext } from '~/types';

export function contextPrompt(context?: SlackMessageContext): string {
  const messageTs = (context?.event as { ts?: string } | undefined)?.ts;
  if (!messageTs) {
    return '';
  }
  return `\
<context>
The current message_ts is: ${messageTs}
</context>`;
}
