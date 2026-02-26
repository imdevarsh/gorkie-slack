import type {
  ChatRequestHints,
  ChatRuntimeContext,
  SandboxRequestHints,
} from '~/types';
import { chatPrompt } from './chat';
import { sandboxPrompt } from './sandbox';

export function systemPrompt(
  opts:
    | {
        agent: 'chat';
        requestHints: ChatRequestHints;
        context: ChatRuntimeContext;
      }
    | {
        agent: 'sandbox';
        context?: ChatRuntimeContext;
        requestHints?: SandboxRequestHints;
      }
): string {
  switch (opts.agent) {
    case 'chat':
      return chatPrompt({
        requestHints: opts.requestHints,
        context: opts.context,
      });
    case 'sandbox':
      return sandboxPrompt({
        context: opts.context,
        requestHints: opts.requestHints,
      });
    default: {
      const _exhaustive: never = opts;
      throw new Error(
        `Unknown agent type: ${(_exhaustive as { agent: string }).agent}`
      );
    }
  }
}
