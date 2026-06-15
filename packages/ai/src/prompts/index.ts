import { contextPrompt } from './context';
import { corePrompt } from './core';
import { customizationPrompt } from './customization';
import type { RequestHints } from './hints';
import { personalityPrompt } from './personality';
import { sandboxPrompt } from './sandbox';
import { toolsPrompt } from './tools';

export type { RequestHints } from './hints';

export function buildSystemPrompt(hints: RequestHints): string {
  return [
    corePrompt,
    personalityPrompt,
    sandboxPrompt,
    toolsPrompt,
    contextPrompt(hints),
    customizationPrompt(hints),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
