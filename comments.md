# Review Comments

This file is a resolved review ledger for `t3code/mcp-app-home-customization`.

## Branch Scope

- Keep this branch focused on MCP App Home and MCP provider cleanup.
- Interactive question-flow work moved to another branch and should stay out of this one.
- Commit checkpoints are fine; do not push unrelated feature work.

## Standing Rules From Review

- Do not use type casts to silence TypeScript. Prefer schema parsing, typed SDK objects, narrower handler arrays, or runtime checks.
- Follow `AGENTS.md`: dict params for multi-argument functions, avoid one-shot helpers, no comments that narrate obvious code, no JSDoc, tunable values in config, feature-owned Slack files.
- Prefer deleting compatibility wrappers and tiny re-export files over renaming them.
- Inline simple logic unless it is reused or genuinely complex.
- Keep encryption calls as `encryptSecret` / `decryptSecret`; schema helpers may validate decrypted JSON at feature boundaries.

## Resolved Review Cleanup

- Split Slack MCP action/view handlers with meaningful external input into folder modules with adjacent schemas.
- Added schema-backed parsing for MCP modal metadata, save forms, bearer-token forms, tool permission forms, modal close payloads, and auth-change modal state.
- Moved reusable MCP URL and OAuth payload validation into `@repo/validators`.
- Removed the old one-line HTTPS URL wrapper and the MCP-local tool-input formatter file.
- Kept guarded fetch byte limiting close to the untrusted MCP fetch implementation and switched IP classification to `ipaddr.js`.
- Validated decrypted MCP approval/OAuth JSON with Zod before returning domain values.
- Removed MCP-specific encrypt/decrypt wrappers so crypto call sites use the shared primitives directly.
- Split Slack action/view exports into typed button, select, submit-view, and closed-view collections.
- Removed approval block casts and typed Slack block payloads directly.
- Moved MCP approval status/message updates after queue resume scheduling.
- Replaced read-then-write MCP credential writes with atomic conflict updates.
- Renamed the reasoning stream approval collector to `collectToolApprovalsFromStream`.
- Destructured `{ tools, cleanup }` from toolset creation.
- Moved shared Slack code-block formatting to Slack core.
- Changed MCP approval action IDs to nested names.
- Removed name-regex read/write grouping and used MCP tool annotations for read-only/destructive grouping.
