import type { RequestHints } from '~/types';
import type { SlackFile } from '~/utils/images';
import { attachmentsPrompt } from './attachments';
import { corePrompt } from './core';
import { examplesPrompt } from './examples';
import { personalityPrompt } from './personality';
import { replyPrompt } from './tasks';
import { toolsPrompt } from './tools';

const getRequestPromptFromHints = (hints: RequestHints) => `\
<context>
The current date and time is ${hints.time}.
You're in the ${hints.server} Slack workspace, inside the ${hints.channel} channel.
You joined the server on ${new Date(hints.joined).toLocaleDateString()}.
Your current status is ${hints.status} and your activity is ${hints.activity}.
</context>`;

export const systemPrompt = ({
  requestHints,
  messageTs,
  files,
}: {
  requestHints: RequestHints;
  messageTs: string;
  files?: SlackFile[];
}) => {
  return [
    corePrompt,
    personalityPrompt,
    examplesPrompt,
    getRequestPromptFromHints(requestHints),
    toolsPrompt,
    replyPrompt,
    attachmentsPrompt(messageTs, files),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
};
