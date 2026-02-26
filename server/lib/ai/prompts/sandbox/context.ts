import type { ContextPromptOptions } from '~/types';

export function contextPrompt({
  context,
  requestHints,
}: ContextPromptOptions): string {
  const messageTs = context?.event.ts;
  if (!(messageTs || requestHints)) {
    return '';
  }

  const parts: string[] = [];

  if (messageTs) {
    parts.push(`The current Message ID / Message TS is: ${messageTs}`);
  }

  if (requestHints) {
    parts.push(`The current date and time is ${requestHints.time}.`);
    parts.push(
      `You're operating in the ${requestHints.server} Slack workspace, ${requestHints.channel} channel.`
    );
  }

  return `<context>\n${parts.join('\n')}\n</context>`;
}
