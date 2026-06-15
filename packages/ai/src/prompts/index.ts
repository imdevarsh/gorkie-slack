import { contextPrompt } from './context';
import { corePrompt } from './core';
import { customizationPrompt } from './customization';
import type { RequestHints } from './hints';
import { personalityPrompt } from './personality';
import { sandboxPrompt } from './sandbox';

export type { RequestHints } from './hints';

export function buildSystemPrompt(hints: RequestHints): string {
  return [
    corePrompt,
    personalityPrompt,
    sandboxPrompt,
    contextPrompt(hints),
    customizationPrompt(hints),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
