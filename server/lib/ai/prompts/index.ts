import type { ChatRequestHints, SlackMessageContext } from '~/types';
import { chatPrompt } from './chat';
import { sandboxPrompt } from './sandbox';

export function systemPrompt(opts: {
  agent: 'chat' | 'sandbox';
  requestHints?: ChatRequestHints;
  context?: SlackMessageContext;
}): string {
  if (opts.agent === 'sandbox') {
    return sandboxPrompt();
  }

  return chatPrompt({
    requestHints: opts.requestHints as ChatRequestHints,
    context: opts.context as SlackMessageContext,
  });
}
