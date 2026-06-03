/**
 * Slack preserves a user's select value across `views.update` for any block
 * whose `block_id` is unchanged — it ignores the new `initial_option`. To make
 * the Configure modal reflect bulk "Set all" changes immediately, every render
 * stamps a fresh `nonce` into the block ids, so Slack treats them as new blocks
 * and shows the new modes.
 *
 * This module is the single owner of that encoding. The payload (permission id
 * or group slug) is the segment after the nonce; nonces never contain `_`.
 */

const TOOL = /^tool_[^_]+_(.+)$/;
const GROUP = /^group_[^_]+_(.+)$/;

export function renderNonce(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export const toolBlock = {
  encode: (nonce: string, permissionId: string) =>
    `tool_${nonce}_${permissionId}`,
  decode: (blockId: string): string | null => blockId.match(TOOL)?.[1] ?? null,
};

export const groupBlock = {
  encode: (nonce: string, slug: string) => `group_${nonce}_${slug}`,
  decode: (blockId: string): string | null => blockId.match(GROUP)?.[1] ?? null,
};
