import { randomUUID } from 'node:crypto';

const TOOL = /^tool_[^_]+_(.+)$/;
const GROUP = /^group_[^_]+_(.+)$/;

export function renderNonce(): string {
  return randomUUID().replaceAll('-', '');
}

export const toolBlock = {
  // Slack preserves select values across view updates when block ids do not change.
  encode: (nonce: string, toolId: string) => `tool_${nonce}_${toolId}`,
  decode: (blockId: string): string | null => blockId.match(TOOL)?.[1] ?? null,
};

export const groupBlock = {
  encode: (nonce: string, slug: string) => `group_${nonce}_${slug}`,
  decode: (blockId: string): string | null => blockId.match(GROUP)?.[1] ?? null,
};
