# Review Comments And Cleanup Plan

This file preserves the review context for `t3code/mcp-app-home-customization` so the next cleanup pass does not depend on chat history.

## Branch Scope

- Keep this branch focused on MCP App Home and MCP provider cleanup.
- Ask-user / ask-question work moved to another branch. Do not reintroduce `askUser`, `ask-user`, question flows, or answer-question UI here.
- Commit checkpoints are fine; do not push unrelated ask-user changes.

## Standing Rules From Review

- Do not use type casts to silence TypeScript. Prefer schema parsing, typed SDK objects, narrower handler arrays, or runtime checks.
- Follow `AGENTS.md`: dict params for multi-argument functions, avoid one-shot helpers, no comments that narrate obvious code, no JSDoc, tunable values in config, feature-owned Slack files.
- Prefer deleting compatibility wrappers and tiny re-export files over renaming them.
- Inline simple logic unless it is reused or genuinely complex.
- Keep encryption calls as `encryptSecret` / `decryptSecret`; do not add an extra MCP-specific wrapper around them.

## Human Review Comments To Remember

- `apps/bot/src/slack/app.ts`: mixed action/view registration with casts was called cursed. Split handlers by actual Slack interaction type instead of casting unions.
- MCP modal metadata in `save-bearer.ts`, `save-tools.ts`, and `connect-closed.ts`: do not `JSON.parse(...) as ServerMeta`; validate metadata with a schema.
- Approval Slack blocks: remove `asSlackBlocks` and any `as unknown as Parameters<...>` update calls. Type the blocks directly.
- Approval action flow: do not mark approval complete before the queued resume has been scheduled.
- Approval state decode: avoid parse casts. Validate decrypted state before returning it.
- `packages/db/src/queries/mcp.ts`: bearer/OAuth upsert calls should be atomic, not read-then-update with a race window.
- `packages/utils/src/guarded-fetch.ts`: use `ipaddr.js` for IP range handling so IPv4-mapped IPv6 and odd address forms are not missed.
- Guarded fetch still has a larger DNS-rebinding concern: validation resolves the host before fetch, but fetch may resolve again. A deeper fix would need connect-time pinning or a custom transport strategy.
- `apps/bot/src/config.ts`: `maxServersPerRequest` should not read from env unless it is really a deployment-tunable setting.
- `validateHttpsUrlForServer` was a one-line wrapper around URL validation and should be removed.
- `BLOCKED_IP_RANGES` and one-shot helpers like `isBlockedIp` / `limitResponseBytes` are not worth extracting unless reuse appears.
- Response byte limiting should stay in guarded MCP fetch because untrusted MCP servers can return huge bodies; keep the logic close to the fetch implementation.
- OAuth/bearer code is still cluttered in places. Prefer direct names and fewer layers over wrappers like `listMcpToolDefinitions`.

## Current Completed Cleanup

- Removed ask-user code from this branch.
- Added no-type-cast guidance and review cleanup notes to `AGENTS.md`.
- Split Slack action/view exports into button, select, submit-view, and closed-view collections.
- Added schema-backed MCP modal metadata parsing.
- Removed approval block casts and typed the Slack block payloads directly.
- Validated approval state with Zod after decrypting.
- Moved MCP approval status/message updates after queue resume scheduling.
- Replaced read-then-write MCP credential writes with `onConflictDoUpdate`.
- Switched guarded fetch IP classification to `ipaddr.js`.
- Removed `validateHttpsUrlForServer`; callers now use `assertSafeHttpsUrl` directly.

## Remaining Cleanup Candidates

- Revisit guarded fetch DNS rebinding if MCP security hardening is in scope.
- Review team scoping in MCP queries and permissions if the app can be installed across multiple Slack teams.
- Continue pruning one-use helpers and overlong MCP function names.
- Review `oauth-provider.ts` bearer/OAuth connection branching for simpler ownership boundaries.
- Review sandbox resume cleanup and dict-param comments from automated review if this branch expands beyond App Home MCP.
