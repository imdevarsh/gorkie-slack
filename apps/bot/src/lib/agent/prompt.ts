import { slackMrkdwnToMarkdown } from '@chat-adapter/slack/format';
import type { Message } from 'chat';
import { annotateMentions } from '@/lib/agent/mentions';

export async function buildPrompt(
  message: Message,
  {
    customizationPrompt,
  }: {
    customizationPrompt?: string;
  } = {}
): Promise<string> {
  const prefix = `@${message.author.userName} (${message.author.userId})`;
  const rawText = getRawSlackText(message);
  const text = rawText
    ? slackMrkdwnToMarkdown(await annotateMentions(rawText))
    : message.text;
  const messageText = `${prefix}: ${text}`;

  return customizationPrompt
    ? [
        '<user_instructions>',
        customizationPrompt,
        '</user_instructions>',
        '',
        messageText,
      ].join('\n')
    : messageText;
}

function getRawSlackText(message: Message): string | undefined {
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
