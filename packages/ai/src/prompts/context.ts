import type { RequestHints } from './hints';

export function contextPrompt(hints: RequestHints): string {
  const lines = [`The current date and time is ${hints.time}.`];
  if (hints.server && hints.channel?.name) {
    lines.push(
      `You're in the ${hints.server} Slack workspace, inside the ${hints.channel.name} channel.`
    );
  }
  lines.push(`The current thread id is ${hints.threadId}.`);
  if (hints.channel?.id) {
    lines.push(`The current channel id is ${hints.channel.id}.`);
  }
  if (hints.messageId) {
    lines.push(`The message you're responding to has id ${hints.messageId}.`);
  }
  lines.push(
    'When earlier channel or thread context matters, fetch it with the Slack/Chat SDK tools instead of pretending you already saw it.'
  );
  lines.push(
    "Gorkie's source code is at https://github.com/imdevarsh/gorkie-slack"
  );
  return `<context>\n${lines.join('\n')}\n</context>`;
}
