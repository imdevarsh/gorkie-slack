import type { RequestHints, SlackMessageContext } from '~/types';
import { corePrompt } from '../shared/core';
import { personalityPrompt } from '../shared/personality';
import { attachmentsPrompt } from './attachments';
import { chatExamplesPrompt } from './examples';
import { replyPrompt } from './tasks';
import { chatToolsPrompt } from './tools';

const getRequestPrompt = (hints: RequestHints) => `\
<context>
The current date and time is ${hints.time}.
You're in the ${hints.server} Slack workspace, inside the ${hints.channel} channel.
You joined the server on ${new Date(hints.joined).toLocaleDateString()}.
Your current status is ${hints.status} and your activity is ${hints.activity}.
</context>`;

export function chatPrompt({
  requestHints,
  context,
}: {
  requestHints: RequestHints;
  context: SlackMessageContext;
}): string {
  return [
    corePrompt,
    personalityPrompt,
    chatExamplesPrompt,
    getRequestPrompt(requestHints),
    chatToolsPrompt,
    replyPrompt,
    attachmentsPrompt(context),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
