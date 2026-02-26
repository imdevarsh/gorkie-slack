import type { ChatRuntimeContext, SandboxRequestHints } from '~/types';

interface ContextOptions {
  context?: ChatRuntimeContext;
  requestHints?: SandboxRequestHints;
}

export function contextPrompt({
  context,
  requestHints,
}: ContextOptions): string {
  const messageTs = (context?.event as { ts?: string } | undefined)?.ts;
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
