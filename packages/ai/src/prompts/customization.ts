import type { RequestHints } from './types';

export function customizationPrompt(hints: RequestHints): string | null {
  const prompt = hints.customization?.prompt;
  if (!prompt) {
    return null;
  }
  return `\
<user_instructions>
The user you're talking to has set the following persistent personal instructions. They are mandatory and must be followed exactly unless they conflict with safety requirements or higher-priority system rules. Treat them as an active behavioral contract, not a suggestion: obey any tone, language, brevity, formatting, or addressing instructions strictly.
${prompt}
</user_instructions>`;
}
