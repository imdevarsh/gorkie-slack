import type { ChatRequestHints, SlackMessageContext } from '~/types';
import { attachmentsPrompt } from './attachments';
import { corePrompt } from './core';
import { examplesPrompt } from './examples';
import { personalityPrompt } from './personality';
import { replyPrompt } from './tasks';
import { toolsPrompt } from './tools';

const getRequestPrompt = (hints: ChatRequestHints) => `\
<context>
The current date and time is ${hints.time}.
You're in the ${hints.server} Slack workspace, inside the ${hints.channel} channel.
You joined the server on ${new Date(hints.joined).toLocaleDateString()}.
Your current status is ${hints.status} and your activity is ${hints.activity}.
</context>`;

const getUserPromptSection = (userPrompt: string) => `\
<user_instructions>
The user you're talking to has set the following persistent personal instructions.
These instructions are mandatory and must be followed exactly across the conversation unless they conflict with safety requirements or higher-priority system rules.
Treat them as an active behavioral contract, not a suggestion.
If they specify things like tone, language, brevity, formatting, or how to address the user, obey those instructions strictly.
${userPrompt}
</user_instructions>`;

export function chatPrompt({
  requestHints,
  context,
}: {
  requestHints: ChatRequestHints;
  context: SlackMessageContext;
}): string {
  return [
    corePrompt,
    personalityPrompt,
    examplesPrompt,
    getRequestPrompt(requestHints),
    requestHints.userPrompt
      ? getUserPromptSection(requestHints.userPrompt)
      : null,
    toolsPrompt,
    replyPrompt,
    attachmentsPrompt(context),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}
