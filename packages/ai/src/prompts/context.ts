import type { RequestHints } from './hints';

export function contextPrompt(hints: RequestHints): string {
  const lines = [`The current date and time is ${hints.time}.`];
  if (hints.server && hints.channel) {
    lines.push(
      `You're in the ${hints.server} Slack workspace, inside the ${hints.channel} channel.`
    );
  }
  if (hints.model) {
    lines.push(`You are running on the ${hints.model} model.`);
  }
  lines.push(`The current thread id is ${hints.threadId}.`);
  if (hints.channelId) {
    lines.push(`The current channel id is ${hints.channelId}.`);
  }
  if (hints.messageId) {
    lines.push(
      `The message you're responding to has id ${hints.messageId}.`
    );
  }
  lines.push(
    "Gorkie's source code is at https://github.com/imdevarsh/gorkie-slack"
  );
  return `<context>\n${lines.join('\n')}\n</context>`;
}
