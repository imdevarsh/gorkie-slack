import type { RequestHints, SlackMessageContext } from '~/types';
import { chatPrompt } from './chat';
import { sandboxPrompt } from './sandbox';

export const systemPrompt = ({
  requestHints,
  context,
  model = 'chat-model',
}: {
  requestHints: RequestHints;
  context: SlackMessageContext;
  model?: 'chat-model' | 'code-model';
}) => {
  if (model === 'code-model') {
    return sandboxPrompt({ requestHints, context });
  }
  return chatPrompt({ requestHints, context });
};

export { sandboxPrompt };
