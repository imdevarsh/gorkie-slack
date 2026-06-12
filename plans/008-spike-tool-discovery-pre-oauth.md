# Plan 008: Spike — preview MCP tools before completing OAuth

> **Executor instructions**: This is a **design/spike plan**, not a build
> plan. The deliverable is a written findings doc plus (if feasible) a small
> prototype — NOT a shipped feature. Follow the steps, honor the STOP
> conditions, and when done update the status row in `plans/README.md` —
> unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/lib/mcp apps/bot/src/slack/features/customizations/mcp docs/mcp-improvements.md`
> If the MCP add/connect flow changed materially since this plan was written,
> compare the "Current state" notes against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: M (coarse — spikes are bounded by time, not scope: ~half a day)
- **Risk**: LOW (prototype only; nothing ships)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

Users adding an MCP server in the App Home can't see what tools it offers
until they complete the full OAuth dance — so they commit auth effort before
seeing the value. `docs/mcp-improvements.md` item 7 and TODO.md ("MCP tool
discovery before full OAuth") both call for a preview. The open design
questions are real enough that building straight ahead would be premature:
many MCP servers refuse unauthenticated `initialize`/`listTools`, Slack modal
flows constrain where an async preview can render, and TODO.md proposes a
server-side endpoint that may be unnecessary (the bot already connects to MCP
servers directly). This spike answers those questions and produces a go/no-go
with a concrete design.

## Current state

- Add-server flow: `apps/bot/src/slack/features/customizations/mcp/view/add.ts`
  builds the "Add MCP Server" modal (name, URL, transport select, auth select
  with `dispatchAction()`, then bearer-token or OAuth client-id block).
  Submission lands in `views/save/index.ts` → `executeBearerSave` /
  `executeOAuthSave`. The auth select's `dispatchAction` already demonstrates
  the modal-update-on-input pattern (`actions/auth-changed/`).
- Tool fetching: `apps/bot/src/lib/mcp/remote.ts` — `openMCPClient` requires a
  credential (bearer headers or OAuth provider); `fetchTools({ credential, server })`
  opens, `listTools()`, closes. There is no credential-less path today.
- Transport: `createMCPClient` from `@ai-sdk/mcp` with
  `fetch: guardedMCPFetch` (SSRF-validated, timeout-bounded — any preview MUST
  go through the same guarded fetch) and `redirect: 'error'`.
- OAuth: `connectOAuthServer` in `apps/bot/src/lib/mcp/connection.ts` runs
  `auth(...)` and returns an authorize URL when user interaction is needed.
- TODO.md sketch (for reference, to be evaluated, not assumed correct):
  "Add a server-side discovery endpoint that attempts listTools() with current
  credentials and returns an empty list on auth failure, then surface the
  result in the Slack setup flow." Note the bot connects to MCP servers
  directly in every other flow — a server (apps/server) endpoint would be a
  new indirection that needs its own justification.
- Conventions: AGENTS.md (inline over extract, dict params), slack-block-builder
  for modals, Ultracite/Biome.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Dev bot   | `bun dev:bot`            | bot starts (needs filled `.env`) |

## Scope

**In scope**:

- `docs/spikes/tool-discovery-pre-oauth.md` (create — the main deliverable)
- Prototype-quality changes on the spike branch only (a `fetchToolsPreview`
  in `apps/bot/src/lib/mcp/remote.ts` and/or a throwaway script under
  `apps/bot/src/scripts/`) — clearly marked, not intended to merge

**Out of scope** (do NOT do):

- Shipping the feature: no merged modal changes, no new apps/server routes,
  no DB changes.
- Modifying `guarded-fetch` or the URL validators.
- OAuth flow changes.

## Git workflow

- Branch: `advisor/008-spike-tool-discovery` (prototype commits stay here)
- The findings doc may be cherry-picked/merged separately:
  `docs: spike findings for pre-OAuth MCP tool discovery`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Answer the protocol question empirically

Write a throwaway script (e.g. `apps/bot/src/scripts/spike-discovery.ts`,
deleted or left on the spike branch) that calls `createMCPClient` with
`fetch: guardedMCPFetch`, **no auth**, against 3–4 real public MCP servers
(pick from servers the maintainer uses — Fathom is referenced in the repo —
plus any well-known public ones). Record per server: does `initialize`
succeed? does `listTools()` return without auth? what error shape comes back
when auth is required (HTTP 401? MCP-level error?).

**Verify**: a results table exists in the findings doc with one row per
server tested. Do not run any traffic through servers you don't have a
legitimate reason to probe; HTTP-level connect + initialize + listTools only.

### Step 2: Decide bot-direct vs server endpoint

Based on step 1 and the codebase: the bot already holds MCP egress (guarded
fetch, SSRF validation) and all other MCP calls are bot-direct. Document
whether anything actually requires an apps/server endpoint (the TODO.md
sketch) — e.g. response caching, keeping discovery off the Slack event loop —
or whether `fetchToolsPreview({ server })` in the bot (catch auth errors →
return `null`) is sufficient. State a recommendation with one paragraph of
reasoning.

### Step 3: Sketch the UX insertion point

Read `view/add.ts`, `actions/auth-changed/`, and `views/save/`. Document the
recommended insertion point with the constraint analysis:

- Option 1: `dispatchAction` on the URL input → modal update with a "Tools"
  preview section (pro: zero clicks; con: fires per keystroke/Enter rules,
  discovery latency inside a 3s-ish modal-update window).
- Option 2: explicit "Preview tools" button block (pro: latency tolerable via
  the open-then-update pattern already used in `actions/configure.ts:21–46`
  — `views.open` a loading state, then `views.update`; con: one extra click).
- For OAuth servers where step 1 showed discovery fails closed: what the
  preview section says ("Sign in to see available tools").

Recommend one option. If feasible in the time box, prototype it on the spike
branch and screenshot/describe behavior in the findings doc.

### Step 4: Write the findings doc

`docs/spikes/tool-discovery-pre-oauth.md` containing: the step-1 results
table, the step-2 architecture recommendation, the step-3 UX recommendation,
open questions (e.g. caching discovery results, rate limiting repeated
previews against arbitrary URLs — note the SSRF guard already applies), a
go/no-go, and if "go": a short build-plan outline (files to touch, modeled on
the structure of plans 001–007).

**Verify**: doc exists; `bun run check:spelling` exits 0 if the doc is staged
for commit; any prototype code typechecks (`bun typecheck`).

## Test plan

Spikes don't ship tests. The findings doc's results table is the evidence.

## Done criteria

- [ ] `docs/spikes/tool-discovery-pre-oauth.md` exists with: results table
      (≥ 3 servers), architecture recommendation, UX recommendation,
      go/no-go, open questions
- [ ] Any prototype code is confined to the spike branch and typechecks
- [ ] No changes merged to modal/save/connection code
- [ ] `plans/README.md` status row updated (DONE = findings delivered, not
      feature shipped)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows essentially **no** server allows unauthenticated listTools —
  then the honest finding is "preview is only viable for bearer/open servers";
  write that up as the conclusion rather than forcing a design.
- You cannot reach any test server from this environment (network policy) —
  deliver the doc with the protocol question marked unresolved and the rest
  of the design contingent.
- The time box (half a day) expires — ship the doc with what you have.

## Maintenance notes

- If this becomes a build plan, the discovery path must reuse
  `guardedMCPFetch` and the `mcpServerUrlSchema` validation — previewing an
  arbitrary user-supplied URL is exactly the SSRF surface those guards exist
  for.
- Discovery results, if cached later, must be keyed per user+URL and treated
  as untrusted display data (tool names/descriptions render in Slack — clamp
  and escape like `view/tools.ts` does).
