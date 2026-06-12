# Plan 011: Make "Always allow" global — remove the thread-scope permission dimension

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- packages/db/src/queries/mcp/permissions.ts apps/bot/src/lib/mcp/remote.ts apps/bot/src/slack/features/customizations/mcp/actions/approval.ts apps/bot/src/slack/features/customizations/mcp/reply.ts apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`
> Plans 003, 005, and 009 touch overlapping files. If they have landed, line
> numbers and some excerpts below will have moved — re-locate by symbol name;
> on a *semantic* mismatch (a symbol is gone or behaves differently), STOP.

## Status

- **Priority**: P2 (maintainer-approved **semantic change**)
- **Effort**: M
- **Risk**: MED — changes what the "Always" approval button grants
- **Depends on**: run AFTER plans 003, 005, and 009 if they are planned to
  land (all three edit the same files; this plan deletes code they touch)
- **Category**: tech-debt
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

Tool permissions currently have two dimensions: a mode (`allow`/`ask`/`block`)
and a scope (`global` / per-`thread`). The only thing that ever writes a
thread-scoped row is the approval card's third button — labeled **"Always in
thread"** — and supporting that one button costs: a discriminated-union input
type and dual-scope merge logic in `permissions.ts`, a two-map return shape
(`{ global, thread }`) that every reader must merge with precedence rules in
`remote.ts`, a `threadTs` parameter threaded through queries, and extra rows
in `mcp_tool_permissions`. The maintainer has decided "Always" should mean
what it says: **allow this tool from now on, everywhere** (revocable any time
in the tools modal). That deletes the entire scope dimension from the code
path. The DB columns stay (cheap, avoids a schema migration); the code simply
only ever writes `scope='global'`.

This is a deliberate **behavior change**: previously, "Always in thread"
auto-allowed a tool only within that Slack thread; after this plan, the
(relabeled) "Always allow" button allows it for all of that user's
conversations. Existing thread-scoped rows in the DB become inert.

## Current state

- `packages/db/src/queries/mcp/permissions.ts` (180 lines):
  - `interface MCPToolModes { global: MCPToolModeMap; thread: MCPToolModeMap }`
  - `type SetMCPToolModesInput` — a two-variant discriminated union on
    `scope: 'global' | 'thread'` (thread variant adds `threadTs`).
  - `getMCPToolModes({ serverId, threadTs?, userId })` (lines 32–75): WHERE
    clause branches on `threadTs` — global rows are `scope='global' AND threadTs=''`,
    thread rows `scope='thread' AND threadTs=<ts>`; result loop splits rows
    into `{ global, thread }`.
  - `setMCPToolModes` / `patchMCPToolModes`: upsert with conflict target
    `(serverId, userId, scope, threadTs)`; both write
    `threadTs: input.scope === 'thread' ? input.threadTs : ''`.
  - `ensureMCPToolModes` (lines 137–163): calls
    `getMCPToolModes({ serverId, userId })`, uses only `.global`, writes back
    with `scope: 'global'`.
- `apps/bot/src/lib/mcp/remote.ts`:
  - Lines 179–191: derives `threadTs` from the event and calls
    `getMCPToolModes({ serverId, threadTs, userId })`.
  - Lines 207–211 (mode precedence):

    ```ts
    const globalMode = modes.global[toolName] ?? defaultToolMode;
    const mode =
      globalMode === 'block'
        ? 'block'
        : (modes.thread[toolName] ?? globalMode);
    ```

- `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`
  lines 177–186: the only thread-scope writer:

  ```ts
  if (reply === 'always' && approval.threadTs) {
    await patchMCPToolModes({
      modes: { [approval.toolName]: 'allow' },
      scope: 'thread',
      serverId: approval.serverId,
      teamId: approval.teamId,
      threadTs: approval.threadTs,
      userId: approval.userId,
    });
  }
  ```

- `apps/bot/src/slack/features/customizations/mcp/reply.ts` — user-facing
  copy: `replyCard('always')` returns
  `{ text: 'Approved for this thread.', title: 'Approved for thread' }`.
- `apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`
  line ~179–180: the approval card button:
  `actionId: actions.approval.always, text: 'Always in thread'`.
- Other `getMCPToolModes` callers (verified at `7e2862a`):
  `actions/set-group-mode.ts:72` and `actions/toggle-group.ts:43` — both
  destructure `{ global: toolModes }` and pass no `threadTs`. (After plan 009,
  `toggle-group.ts` no longer exists and `set-group-mode.ts` may not call it —
  re-grep.)
- Other `patchMCPToolModes` callers: `actions/save-tool-mode.ts:37` and
  `actions/set-group-mode.ts:64`, both already `scope: 'global'`.
- Schema (`packages/db/src/schema/mcp.ts:119–137`): `mcpToolPermissions` has
  `scope` enum + `threadTs` with unique index
  `(serverId, userId, scope, threadTs)`. **Not modified by this plan.**
- Conventions: dict params; Ultracite/Biome; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Tests     | `bun run test`           | all pass (if plan 001 landed) |

## Scope

**In scope**:

- `packages/db/src/queries/mcp/permissions.ts`
- `apps/bot/src/lib/mcp/remote.ts` (mode lookup + precedence only)
- `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`
  (the `reply === 'always'` branch only)
- `apps/bot/src/slack/features/customizations/mcp/reply.ts` (copy)
- `apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`
  (button label only)
- Mechanical call-site updates in
  `actions/set-group-mode.ts` / `actions/save-tool-mode.ts` (and
  `actions/toggle-group.ts` if plan 009 has not landed)

**Out of scope** (do NOT touch):

- `packages/db/src/schema/mcp.ts` — columns and index stay; dropping them is
  a separate, explicitly deferred schema change.
- Approval claim/finalize/supersede logic, batching, resume (plan 003's
  territory).
- The `needsApproval` / `block` semantics and `defaultToolMode`.
- Existing thread-scoped rows in the database — leave them; they become
  unread. (Optional one-off cleanup SQL goes in the report, not in code.)

## Git workflow

- Branch: `advisor/011-remove-thread-scope`
- Conventional commit, e.g.
  `refactor!: approval "Always" grants global allow; drop thread-scope reads/writes`
  (note the `!` — semantic change)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Flatten the queries

In `packages/db/src/queries/mcp/permissions.ts`:

1. Delete the `MCPToolModes` interface. `getMCPToolModes({ serverId, userId })`
   loses `threadTs`, queries only
   `scope='global' AND threadTs=''`, and returns `MCPToolModeMap` directly
   (the single global map; empty object when no row).
2. Collapse `SetMCPToolModesInput` to one shape:
   `{ modes, serverId, teamId?, userId }`. `setMCPToolModes` and
   `patchMCPToolModes` hardcode `scope: 'global', threadTs: ''` in their
   values (DB columns unchanged, so the conflict target keeps working).
3. `ensureMCPToolModes`: adjust to the flat return
   (`current[toolName]` instead of `current.global[toolName]`); drop `scope`
   from its write call.

**Verify**: `bun typecheck` — errors remain only at the known callers
(remote.ts, approval.ts, set-group-mode, save-tool-mode, toggle-group if
present); fix them in the next steps.
`grep -n "scope" packages/db/src/queries/mcp/permissions.ts` → only the two
hardcoded `scope: 'global'` writes and the WHERE filter.

### Step 2: Simplify the consumers

1. `remote.ts`: remove the `threadTs` derivation for modes; call
   `getMCPToolModes({ serverId: server.id, userId })`; precedence collapses to:

   ```ts
   const mode = modes[toolName] ?? defaultToolMode;
   ```

   (`block` no longer needs special-casing — there is only one map.)
2. `actions/set-group-mode.ts`, `actions/save-tool-mode.ts` (and
   `toggle-group.ts` if it still exists): drop `scope: 'global'` from
   `patchMCPToolModes` calls and adjust `getMCPToolModes` destructuring to the
   flat map.

**Verify**: `bun typecheck` → exit 0 except `approval.ts`.

### Step 3: Re-point the "Always" button

1. `approval.ts` lines 177–186: replace the thread-scope patch with:

   ```ts
   if (reply === 'always') {
     await patchMCPToolModes({
       modes: { [approval.toolName]: 'allow' },
       serverId: approval.serverId,
       teamId: approval.teamId,
       userId: approval.userId,
     });
   }
   ```

   (No `threadTs` guard — global allow doesn't need a thread.)
2. `reply.ts`: `replyCard('always')` →
   `{ text: 'Always allowed. Manage this under App Home → MCP tools.', title: 'Always allowed' }`.
3. `approval-helpers.ts`: button text `'Always in thread'` → `'Always allow'`.

**Verify**: `bun typecheck`, `bun check` → exit 0;
`grep -rn "scope: 'thread'\|Always in thread\|Approved for thread" apps packages` → no matches;
`grep -rn "modes.thread\|\.thread\[" apps/bot/src` → no matches.

### Step 4: Sanity-read the full permission path

Read `wrapper.ts` (`mode === 'block'` / `needsApproval: mode === 'ask'`) and
confirm nothing else consumed the thread map. Run
`grep -rn "threadTs" apps/bot/src/lib/mcp packages/db/src/queries/mcp` —
remaining hits must be approval-row fields (approvals store `threadTs` for
card/resume bookkeeping — that is unrelated and stays) and the hardcoded `''`
writes in permissions.ts.

**Verify**: report the grep output classified as above.

## Test plan

If plan 001 landed, no DB harness exists for permissions; rely on typecheck +
greps. Manual recipe for the operator (include in report): in a dev workspace
set a tool to "Ask", trigger it, click **Always allow**; confirm (1) the card
says "Always allowed", (2) the tools modal now shows that tool as
"Allow always", (3) the tool runs without approval in a *different* thread —
the new semantics, (4) setting it back to "Ask" in the modal re-enables
approval prompts.

## Done criteria

- [ ] `bun typecheck`, `bun check`, `bun run test` all exit 0
- [ ] `getMCPToolModes` takes `{ serverId, userId }` and returns a flat
      `MCPToolModeMap`; no `{ global, thread }` shape remains in the repo
- [ ] No code writes or reads `scope: 'thread'`
      (`grep -rn "'thread'" apps/bot/src packages/db/src/queries` → no
      permission-related matches)
- [ ] Approval button reads "Always allow"; card copy updated
- [ ] `packages/db/src/schema/mcp.ts` unchanged (`git diff --stat` confirms)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You find another thread-scope writer besides `approval.ts` (the audit found
  exactly one) — a second writer means the feature is load-bearing somewhere
  unaudited.
- Plan 003 landed and restructured the `reply === 'always'` region in a way
  that makes the step-3 replacement ambiguous — reconcile by symbol, and if
  the resume/reopen logic now depends on the thread patch, report.
- Anything in `respond.ts`/`resume.ts`/orchestrator reads thread modes
  directly (it shouldn't — re-grep before assuming).

## Maintenance notes

- Deferred follow-up (do NOT do here): drop the now-unwritten `scope`/`threadTs`
  columns and simplify the unique index to `(serverId, userId)` via `db:push`,
  plus a one-off `DELETE FROM mcp_tool_permissions WHERE scope = 'thread'`.
  Schedule it once this has soaked.
- Plan 005's `remote.ts` excerpts include the old two-map precedence — if 005
  has not run yet, refresh its "Current state" section after this lands (its
  drift check will catch it regardless).
- Reviewer should focus on the semantic diff: "Always" now persists beyond
  the thread. The card copy pointing at App Home is the mitigation — keep it.
