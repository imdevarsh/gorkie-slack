import type { ModelMessage } from 'ai';

export function getMessageText(message: ModelMessage): string {
  const { content } = message;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return (
      content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (typeof part === 'object' && part) {
            const maybeText = (part as { text?: unknown }).text;
            if (typeof maybeText === 'string') {
              return maybeText;
            }
          }
          return '';
        })
        // TODO: @channel protection
        .filter(Boolean)
        .join('\n')
    );
  }

  if (typeof content === 'object' && content) {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === 'string') {
      return maybeText;
    }
  }

  return '';
}

export function buildHistorySnippet(
  messages: ModelMessage[],
  limit: number
): string {
  return messages
    .slice(-limit)
    .map((msg) => getMessageText(msg))
    .filter(Boolean)
    .join('\n');
}

export function shouldUse(message: string) {
  if (message.startsWith('##')) {
    return false;
  }
  return true;
}
