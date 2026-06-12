# Plan 004: Lock connection-defining MCP server fields at the query layer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- packages/db/src/queries/mcp/servers.ts docs/mcp-improvements.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

An MCP server's `url`, `transport`, and `authType` define what the bot
connects to and how stored credentials are sent. Changing a connected server's
URL re-aims its (still-valid, encrypted) credentials and the bot's egress at a
new host — the classic post-audit repointing attack
(`docs/mcp-improvements.md` item 1; also an open TODO.md item, "MCP server
edit flow"). The audit verified there is currently **no UI path** that edits
these fields (all `updateMCPServer` call sites write only
`enabled`/`lastError`/`lastConnectedAt`), but the query layer's
`MCPServerUpdate` type still accepts `url`, `transport`, and `authType` — so
the next feature that touches server editing can silently reintroduce the
hole. This plan enforces the policy at the type level: connection-defining
fields are immutable after creation; changing them requires delete + re-add.

## Current state

- `packages/db/src/queries/mcp/servers.ts:15–25`:

  ```ts
  type MCPServerUpdate = Partial<
    Pick<
      NewMCPServer,
      | 'authType'
      | 'enabled'
      | 'lastConnectedAt'
      | 'lastError'
      | 'name'
      | 'transport'
      | 'url'
    >
  >;
  ```

  `updateMCPServer` (lines ~104–116) applies `values: MCPServerUpdate` via
  `db.update(mcpServers).set({ ...values, updatedAt: new Date() })` scoped by
  `id + userId`.

- All current `updateMCPServer` call sites (verified by grep at the planned
  commit) pass only `enabled`, `lastError`, `lastConnectedAt`:
  - `apps/bot/src/slack/features/customizations/mcp/actions/configure.ts:55`
  - `apps/bot/src/slack/features/customizations/mcp/actions/reset-tools.ts:65`
  - `apps/bot/src/slack/features/customizations/mcp/actions/disconnect.ts:30`
  - `apps/bot/src/slack/features/customizations/mcp/actions/toggle.ts:42,67,83`
  - `apps/bot/src/lib/mcp/connection.ts:35,52`
  - `apps/bot/src/lib/mcp/remote.ts:239`

- `docs/mcp-improvements.md` item 1 ("Field-level lockdown") describes this
  finding; it references file paths that have since moved (the doc predates a
  refactor — e.g. it cites `packages/db/src/queries/mcp.ts`, now split into
  `packages/db/src/queries/mcp/*.ts`).

- Repo conventions: comments only for constraints the code can't show (this
  policy comment qualifies); Ultracite/Biome; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |

## Scope

**In scope**:

- `packages/db/src/queries/mcp/servers.ts`
- `docs/mcp-improvements.md` (mark item 1 resolved — see step 3)

**Out of scope** (do NOT touch):

- Slack modal/view code — there is no edit-server UI to change; do not build
  one, and do not add UI copy about delete-and-re-add.
- `createMCPServer` / `NewMCPServer` — creation legitimately sets all fields.
- `name` mutability — name is cosmetic and stays editable by policy
  (LibreChat's model, cited in the doc).

## Git workflow

- Branch: `advisor/004-mcp-server-update-lockdown`
- Conventional commit, e.g. `fix: make MCP server url/transport/authType immutable after creation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Narrow `MCPServerUpdate`

In `packages/db/src/queries/mcp/servers.ts`, change the type to:

```ts
// url, transport, and authType are immutable after creation: editing them
// would re-aim stored credentials at a new host. Changing the connection
// requires delete + re-add (docs/mcp-improvements.md item 1).
type MCPServerUpdate = Partial<
  Pick<NewMCPServer, 'enabled' | 'lastConnectedAt' | 'lastError' | 'name'>
>;
```

**Verify**: `bun typecheck` → exit 0. A typecheck failure here means some call
site DOES pass a connection-defining field — that is a STOP condition (see
below), because it means the audit's call-site inventory is stale.

### Step 2: Confirm the inventory

Run:

```
grep -rn "updateMCPServer" apps packages --include="*.ts" | grep -v import
```

Confirm the call-site list matches "Current state" (same files; line numbers
may drift slightly). Confirm none passes `url`, `transport`, or `authType`.

**Verify**: the grep output matches; `bun check` → exit 0.

### Step 3: Mark the doc item resolved

In `docs/mcp-improvements.md`, under item 1, append a short resolution note
(keep the original text for history):

> **Resolved (2026-06):** there is no UI edit path for these fields, and
> `MCPServerUpdate` in `packages/db/src/queries/mcp/servers.ts` now excludes
> `url`/`transport`/`authType` at the type level. Changing a connection
> requires delete + re-add.

**Verify**: `bun run check:spelling` → exit 0.

## Test plan

Type-level enforcement is verified by the compiler (step 1). No runtime test
is needed: there is no code path to test — that is the point. If plan 001 has
landed and you want a tripwire, you may add a `@ts-expect-error` compile
assertion in a test file, but this is optional and not required for done.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun check` exits 0; `bun run check:spelling` exits 0
- [ ] `grep -n "'url'" packages/db/src/queries/mcp/servers.ts` → no match
      inside `MCPServerUpdate`
- [ ] `docs/mcp-improvements.md` item 1 carries the resolution note
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's typecheck fails because a call site passes `url`, `transport`, or
  `authType` — that call site is a live instance of the vulnerability this
  plan closes; report it with file:line rather than widening the type back.
- An edit-server UI has appeared since the planned commit (check
  `apps/bot/src/slack/features/customizations/mcp/actions/` for new files) —
  the lockdown then needs UX coordination beyond this plan.

## Maintenance notes

- Anyone adding a "reconnect with new URL" feature later must route it through
  delete + re-add (which cascades connections and permissions via the schema's
  `onDelete: 'cascade'`), not through a widened `MCPServerUpdate`.
- Reviewer should check the comment stays attached to the type if the file is
  reorganized.
- Plan 006 also edits `docs/mcp-improvements.md` (items 2 and 4). If both
  plans run, coordinate: apply this plan's doc note first or merge carefully.
