import type { ChatRequestHints, SlackMessageContext } from "../../types";
import { attachmentsPrompt } from "./attachments";
import { corePrompt } from "./core";
import { examplesPrompt } from "./examples";
import { personalityPrompt } from "./personality";
import { replyPrompt } from "./tasks";
import { toolsPrompt } from "./tools";

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
    `<context>
The current date and time is ${requestHints.time}.
You're in the ${requestHints.server} Slack workspace, inside the ${requestHints.channel} channel.
You joined the server on ${new Date(requestHints.joined).toLocaleDateString()}.
Your current status is ${requestHints.status} and your activity is ${requestHints.activity}.
</context>`,
    requestHints.customization?.prompt
      ? `<user_instructions>
The user you're talking to has set the following persistent personal instructions.
These instructions are mandatory and must be followed exactly across the conversation unless they conflict with safety requirements or higher-priority system rules.
Treat them as an active behavioral contract, not a suggestion.
If they specify things like tone, language, brevity, formatting, or how to address the user, obey those instructions strictly.
${requestHints.customization.prompt}
</user_instructions>`
      : null,
    toolsPrompt,
    replyPrompt,
    attachmentsPrompt(context),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
