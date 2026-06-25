import { contextPrompt } from './context';
import { corePrompt } from './core';
import type { RequestHints } from './hints';
import { personalityPrompt } from './personality';
import { sandboxPrompt } from './sandbox';
import { slackPrompt } from './slack';

export type { RequestHints } from './hints';

export function systemPrompt({ hints }: { hints: RequestHints }): string {
  return [
    corePrompt,
    personalityPrompt,
    sandboxPrompt,
    slackPrompt,
    contextPrompt(hints),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
