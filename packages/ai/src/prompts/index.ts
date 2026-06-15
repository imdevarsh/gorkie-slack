import { contextPrompt } from './context';
import { corePrompt } from './core';
import { customizationPrompt } from './customization';
import { personalityPrompt } from './personality';
import { sandboxPrompt } from './sandbox';
import type { RequestHints } from './types';

export type { RequestHints } from './types';

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
