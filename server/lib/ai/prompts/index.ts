import type { RequestHints, SlackMessageContext } from '~/types';
import { chatPrompt } from './chat';
import { sandboxPrompt } from './sandbox';

export function systemPrompt(
  opts:
    | {
        agent: 'chat';
        requestHints: RequestHints;
        context: SlackMessageContext;
      }
    | {
        agent: 'sandbox';
        context?: SlackMessageContext;
      }
): string {
  switch (opts.agent) {
    case 'chat':
      return chatPrompt({
        requestHints: opts.requestHints,
        context: opts.context,
      });
    case 'sandbox':
      return sandboxPrompt(opts.context);
    default: {
      const _exhaustive: never = opts;
      throw new Error(
        `Unknown agent type: ${(_exhaustive as { agent: string }).agent}`
      );
    }
  }
}
