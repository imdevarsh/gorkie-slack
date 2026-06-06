import { clampText } from '@repo/utils/text';

type SlackButtonStyle = 'danger' | 'primary';

interface SlackCardButton {
  action_id: string;
  style?: SlackButtonStyle;
  text: { emoji: false; text: string; type: 'plain_text' };
  type: 'button';
  value: string;
}

interface SlackCardBlock {
  actions?: SlackCardButton[];
  body?: { text: string; type: 'mrkdwn' };
  title: { text: string; type: 'mrkdwn' };
  type: 'card';
}

export function buttonElement({
  actionId,
  style,
  text,
  value,
}: {
  actionId: string;
  style?: SlackButtonStyle;
  text: string;
  value: string;
}): SlackCardButton {
  return {
    action_id: actionId,
    text: { emoji: false, text, type: 'plain_text' },
    type: 'button',
    value,
    ...(style ? { style } : {}),
  };
}

export function cardBlock({
  actions,
  body,
  title,
}: {
  actions?: SlackCardButton[];
  body?: string;
  title: string;
}): SlackCardBlock {
  return {
    ...(body ? { body: { text: clampText(body, 200), type: 'mrkdwn' } } : {}),
    title: { text: clampText(title, 150), type: 'mrkdwn' },
    type: 'card',
    ...(actions ? { actions } : {}),
  };
}

export function codeBlock({
  maxLength,
  value,
}: {
  maxLength: number;
  value: string;
}): string {
  return `\`\`\`${clampText(value.replaceAll('```', "'''"), maxLength)}\`\`\``;
}

export function inlineCode(value: string): string {
  return `\`${mdText(value.replaceAll('`', "'"))}\``;
}

export function mdText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
