import type { RequestHints } from '~/types';
import { corePrompt } from './core';
import { examplesPrompt } from './examples';
import { personalityPrompt } from './personality';
import { replyPrompt } from './tasks';
import { toolsPrompt } from './tools';

const getRequestPromptFromHints = (hints: RequestHints) => {
  const attachments =
    hints.attachments.length > 0
      ? `\nAttachments available in sandbox:\n${hints.attachments.map((f) => `  - ${f.path} (${f.mimetype})`).join('\n')}\nClean up with "rm -rf attachments/" after use.`
      : '';

  return `\
<context>
The current date and time is ${hints.time}.
You're in the ${hints.server} Slack workspace, inside the ${hints.channel} channel.
You joined the server on ${new Date(hints.joined).toLocaleDateString()}.
Your current status is ${hints.status} and your activity is ${hints.activity}.${attachments}
</context>`;
};

export const systemPrompt = ({
  requestHints,
}: {
  requestHints: RequestHints;
}) => {
  return [
    corePrompt,
    personalityPrompt,
    examplesPrompt,
    getRequestPromptFromHints(requestHints),
    toolsPrompt,
    replyPrompt,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
};
