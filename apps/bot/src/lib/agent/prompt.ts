import { slackMrkdwnToMarkdown } from '@chat-adapter/slack/format';
import type { Message } from 'chat';
import { annotateMentions } from '@/lib/agent/mentions';
import { rawSlackText } from '@/lib/utils/message';

export async function buildPrompt(
  message: Message,
  {
    customizationPrompt,
  }: {
    customizationPrompt?: string;
  } = {}
): Promise<string> {
  const prefix = `@${message.author.userName} (${message.author.userId})`;
  const slackText = rawSlackText(message);
  const text = slackText
    ? slackMrkdwnToMarkdown(await annotateMentions(slackText))
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
