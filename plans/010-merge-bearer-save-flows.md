# Plan 010: Merge the duplicated bearer connect flows (create + reconnect)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/slack/features/customizations/mcp/views apps/bot/src/slack/features/customizations/mcp/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED (two working user flows funnel through one code path)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

Two view-submission handlers implement bearer-token connection with
near-identical bodies — including a **byte-identical** private `updateView`
helper and identical connect/success/error/publish sequences:

- `views/save/bearer.ts` (126 lines) — "Add MCP Server" submission with
  `auth = bearer`: validates base fields, **creates** the server row, then
  connects.
- `views/save-bearer/index.ts` (112 lines) — reconnect modal submission
  (`views.bearer` callback): reads `serverId` from `private_metadata`,
  **loads** the existing server, then connects.

Every change to bearer connection UX (copy, error rendering, retry behavior)
must currently be made twice, and the two copies have already started to
drift in trivial ways (log message wording, error copy "Enter a token." vs
"Enter a bearer token."). ~240 lines collapse to ~150 with one shared
connect-and-render function whose only variable part is how the `server` row
is obtained.

## Current state

- `views/save/bearer.ts` — exports `executeBearerSave(args: SubmitArgs)`.
  Flow: `parseBaseFields({ view })` (from `./base`) + bearer token via
  `textFieldValue({ field: 'bearer', ... })` → on validation errors
  `ack({ response_action: 'errors', errors })` → otherwise
  `ack({ response_action: 'update', view: statusModal({ title: 'Connect MCP', text: 'Connecting…' }) })`
  → `createMCPServer({ authType: 'bearer', enabled: false, name, teamId, transport, url, userId })`
  (with its own try/catch + null-result handling rendering "Could not save
  this MCP server.") → `connectBearerServer({ rawToken, server, teamId, userId })`
  → success: `statusModal` "*<name> is connected and enabled.*…" / failure:
  `bearerModal({ error, serverId, serverName })` → `publishHome`.
- `views/save-bearer/index.ts` — exports `name = views.bearer` and
  `execute(args: SubmitArgs)`. Flow: bearer token required (errors-ack) →
  `serverId` from `parseServerMeta({ metadata: view.private_metadata })`
  (errors-ack if missing) → `getMCPServerById`; requires
  `server.authType === 'bearer'` (errors-ack otherwise) → identical
  `ack(update statusModal 'Connecting…')` → identical
  `connectBearerServer` → identical success/failure rendering →
  `publishHome`.
- Both files contain this identical helper (only the log message differs):

  ```ts
  function updateView({ client, userId, view, viewId }: {...}) {
    return client.views.update({ view_id: viewId, view })
      .catch((error: unknown) => {
        logger.warn({ ...toLogError(error), userId, viewId }, 'Failed to update MCP bearer ... modal');
      });
  }
  ```

- Wiring: `views/save/index.ts` routes the add-modal submission to
  `executeBearerSave` or `executeOAuthSave` based on the auth select.
  `index.ts` registers `saveBearer` (`views.bearer`) in `submitViews`.
  `view/authentication/bearer.ts` builds `bearerModal` (the reconnect modal
  that carries `serverId` in its metadata).
- Conventions: dict params; **inline over extract** — but this helper is
  called from two flows, which is exactly when AGENTS.md says extraction is
  right; Ultracite/Biome; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Tests     | `bun run test`           | all pass (if plan 001 landed) |

## Scope

**In scope** (under `apps/bot/src/slack/features/customizations/mcp/`):

- `views/save/bearer.ts` (becomes the shared implementation home, or a new
  sibling file `views/save/connect-bearer-flow.ts` if cleaner — executor's
  choice, stay inside `views/save/`)
- `views/save-bearer/index.ts` (shrinks to: validate → resolve server →
  delegate)
- `views/save/index.ts`, `index.ts` (only if imports/exports move)

**Out of scope** (do NOT touch):

- `lib/mcp/connection.ts` (`connectBearerServer` is already the shared core —
  this plan is about the Slack-side wrapper, not the connect logic)
- `views/save/oauth.ts`, `views/save/base.ts`, the add modal, OAuth flows
- Error-copy redesign beyond picking one of the two existing strings per spot

## Git workflow

- Branch: `advisor/010-merge-bearer-save-flows`
- Conventional commit, e.g. `refactor: single bearer connect flow for create and reconnect`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the shared flow

Create one function (dict params) in `views/save/` that both handlers call
after they have a `server` row:

```ts
async function connectBearerAndRender({ bearerToken, body, client, server, viewId }: {
  bearerToken: string;
  body: SubmitArgs['body'];
  client: SubmitArgs['client'];
  server: MCPServer;
  viewId: string;
}): Promise<void>
```

Body = the today-identical tail: try `connectBearerServer` → success
`statusModal` copy / failure `bearerModal({ error, serverId, serverName })` →
`publishHome`. Include the single `updateView` helper here (one copy, one log
message: `'Failed to update MCP bearer modal'`).

### Step 2: Reduce both handlers to their genuinely different halves

- `executeBearerSave` (create path): keep field validation +
  `ack(errors | update statusModal)` + `createMCPServer` error handling, then
  call `connectBearerAndRender`.
- `views/save-bearer/index.ts` (reconnect path): keep token presence check +
  `serverId` metadata resolution + `getMCPServerById` + authType guard +
  `ack(update statusModal)`, then call `connectBearerAndRender`.

Where the two old copies diverged in copy strings, pick one string and use it
in both (e.g. `'Enter a token.'`); note the choices in the commit message.

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0;
`grep -rn "function updateView" apps/bot/src/slack/features/customizations/mcp/views` → exactly **one** match;
`grep -c "connectBearerServer(" apps/bot/src/slack/features/customizations/mcp/views -r` → exactly 1 call site.

### Step 3: Confirm registrations unchanged

`index.ts` must still register the same callback ids: `views.add` routed via
`views/save/index.ts`, `views.bearer` via `views/save-bearer`. Only internals
moved.

**Verify**: `grep -n "saveBearer\|save.name" apps/bot/src/slack/features/customizations/mcp/index.ts`
→ both registrations present and unchanged.

## Test plan

No Slack harness exists; the flows are I/O wrappers. Manual recipe for the
operator (include in report): in a dev workspace (1) add a new bearer server
with a bad token → expect the bearer modal with the error; with a good token →
"connected and enabled" status; (2) disconnect and reconnect via the bearer
reconnect modal with bad then good token → same two outcomes. Both paths now
exercise the same rendering code.

## Done criteria

- [ ] `bun typecheck`, `bun check`, `bun run test` all exit 0
- [ ] Exactly one `updateView` helper and one `connectBearerServer` call site
      remain under `views/`
- [ ] Combined line count of the two handler files + any new shared file is
      ≤ ~170 (from 238)
- [ ] Callback ids `views.add` and `views.bearer` still registered identically
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The two flows' tails are NOT identical in the live code (drift since
  `7e2862a` introduced a real behavioral difference) — list the difference
  instead of silently picking one.
- Merging requires changing `connectBearerServer`'s signature or behavior.

## Maintenance notes

- Future bearer-flow UX changes now land in one place; the create/reconnect
  split is only about how `server` is obtained.
- Reviewer should diff each handler against its pre-merge behavior
  (validation messages, ack sequencing — `ack` must happen exactly once per
  submission, with `errors` or `update`).
- If TODO.md's "lock down connection-defining fields" edit-flow work ever
  builds a real edit modal, it should reuse `connectBearerAndRender` rather
  than adding a third copy.
