import type { ChatRequestHints, SlackMessageContext } from '~/types';
import { chatPrompt } from './chat';

export function systemPrompt(opts: {
  agent: 'chat';
  requestHints: ChatRequestHints;
  context: SlackMessageContext;
}): string {
  return chatPrompt({
    requestHints: opts.requestHints,
    context: opts.context,
  });
}
