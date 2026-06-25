import type { Message } from 'chat';

const leadingMentions = /^\s*(?:<@[A-Z0-9][A-Z0-9._-]*(?:\|[^>]+)?>\s*)+/;

export function rawSlackText(message: Message): string | undefined {
  const raw = message.raw;
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('text' in raw) ||
    typeof raw.text !== 'string'
  ) {
    return;
  }
  return raw.text;
}

export function rawText(message: Message): string {
  return rawSlackText(message) ?? message.text;
}

export function withoutLeadingMentions(text: string): string {
  return text.replace(leadingMentions, '');
}
