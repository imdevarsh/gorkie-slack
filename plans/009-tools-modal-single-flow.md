# Plan 009: Rebuild the MCP tools modal as a single render flow (cap + Enter-search, no accordion, no Fuse, no tool list in metadata)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/slack/features/customizations/mcp packages/validators/src/features/mcp/slack.ts apps/bot/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (maintainer-requested simplification)
- **Effort**: M
- **Risk**: MED (user-facing modal behavior changes, deliberately)
- **Depends on**: none. Coordinate with plan 011 (it edits `set-group-mode.ts` after this plan rewrites it — run 009 first).
- **Category**: tech-debt
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

The MCP tools-configuration modal is 762 lines across 9 files and has needed
repeated fix/revert commits (views.update hash chaining, accordion default-open
flip-flops). It currently has four render paths (error / search results /
accordion when >40 tools / flat list when ≤40) and two live defects:

1. **Network fetch per keystroke**: search uses `on_character_entered`, and
   each event re-fetches the server's tool list (`syncToolsForView` →
   `listTools()`) plus a loading-modal update and a hash-chained second update.
2. **`private_metadata` overflow**: the modal serializes every tool name into
   `private_metadata` (so group actions can rebuild the list). Slack caps
   private_metadata at 3,000 characters; a ~100-tool server exceeds it and the
   resulting `views.update` failure is swallowed by `.catch(() => undefined)`.

The maintainer has approved replacing all of it with **one render pipeline**:
filter by search (substring, Enter-triggered) → group headers → flat rows
capped at a global row budget → truncation note pointing at search. Search is
the overflow mechanism, so the accordion, its toggle action, its open-state,
the Fuse.js dependency, and the tool list in metadata are all deleted.
Behavior intentionally kept: ro/dt/gn group headers, per-group "Set all…",
per-tool auto-save selects, Reset, error view, Done.

## Current state

All paths relative to `apps/bot/src/slack/features/customizations/mcp/`.

- `view/tools.ts` (347 lines) — exports `ToolEntry`, `toToolEntries`,
  `toolsLoadingModal`, `toolsModal`. Key pieces to know:
  - `injectCharacterDispatch` (lines 41–57): `structuredClone`s the built view
    and mutates raw block JSON to add
    `dispatch_action_config: { trigger_actions_on: ['on_character_entered'] }`
    to the search input — exists only because slack-block-builder can't
    express it. **Delete entirely**; the builder's plain `.dispatchAction()`
    defaults to Enter-triggered dispatch for text inputs.
  - `toToolEntries` (59–70): maps `annotations.readOnlyHint`→`'ro'`,
    `destructiveHint`→`'dt'`, else `'gn'`. **Keep as-is** (callers:
    `actions/helpers.ts`).
  - `toolsLoadingModal` (91–124): "Searching…" intermediate view. **Delete.**
  - `ACCORDION_THRESHOLD = 40`; `MAX_TOOLS_PER_GROUP = Math.floor((100 - 5) / 1)`
    (obfuscated 95; Slack's hard limit is 100 blocks per view).
  - `toolsModal` (129–347): `privateMetaData` currently includes
    `{ nonce, open, search, serverId, serverName, tools: toolsByGroup }`;
    branches: error → Fuse search results (with per-group headers + set-all) →
    accordion vs flat (two `flatMap`s over `['ro','dt','gn']`).
  - Per-tool row pattern (keep): Section with `blockId: toolBlock.encode(nonce, name)`,
    text `formatToolName(name).slice(0, 180)`, accessory StaticSelect
    `actionId: inputs.toolMode` with initial option from
    `toolModes[name] ?? 'ask'`.
  - The nonce (`block-id.ts`) exists because Slack preserves select values
    across `views.update` when block ids are unchanged — re-renders after
    set-all/reset need fresh block ids so selects show new values. **Keep the
    nonce mechanism.**
- `actions/search-tools.ts` (64) — keystroke handler: loading modal update →
  `syncToolsForView` → second update with chained hash. **Rewrite** (Enter
  handler, single update).
- `actions/toggle-group.ts` (62) — accordion open/close. **Delete.**
- `actions/set-group-mode.ts` (97) — per-group "Set all…": reads the group's
  names from metadata `tools`, re-filters with a second Fuse instance when
  search is active, `patchMCPToolModes`, re-reads modes, re-renders. **Rewrite**
  to fetch instead of metadata.
- `actions/save-tool-mode.ts` (44) — per-tool auto-save; reads only `serverId`
  from metadata; does not re-render. **Unchanged.**
- `actions/reset-tools.ts` (86) — status modal → delete permissions →
  `syncToolsForView` → render. **Unchanged except** it must compile against the
  new `toolsModal` signature.
- `actions/configure.ts` (73) — opens loading status modal, `syncToolsForView`,
  renders `toolsModal`. **Unchanged except** signature.
- `actions/helpers.ts` (29) — `syncToolsForView({ server, teamId, userId })` →
  `{ error?, toolEntries, toolModes }`. **Unchanged**; this becomes the single
  source of the tool list for every action that re-renders.
- `block-id.ts` (19) — `renderNonce`, `toolBlock`, `groupBlock`
  encode/decode. **Keep** (`groupBlock` still identifies which group's
  set-all fired).
- `ids.ts` — `actions.searchTools`, `actions.setGroupMode`,
  `actions.toggleGroup`, `blocks.search`, `inputs.toolMode`, `groupNames`.
  Remove `toggleGroup`.
- `index.ts` (59) — registration lists; `searchTools` under `inputActions`,
  `toggleGroup`/`setGroupMode` under button/select actions.
- `packages/validators/src/features/mcp/slack.ts` —
  `mcpToolsMetaSchema = { nonce?, open?, search?, serverId?, serverName?, tools? }`,
  plus `mcpToolsByGroupSchema`/`MCPToolsByGroup` and
  `mcpGroupSlugSchema`/`GroupSlug`. `GroupSlug` stays (used by `ToolEntry` and
  set-group-mode); `open` and `tools` leave the meta schema;
  `mcpToolsByGroupSchema` keeps one consumer or dies — see step 5.
- `apps/bot/package.json` — `"fuse.js": "^7.4.2"` (only imported by
  `view/tools.ts` and `actions/set-group-mode.ts`; other grep hits are
  "langfuse"). Removed at the end.
- Conventions: slack-block-builder for all blocks; dict params; inline over
  extract; Ultracite/Biome (`bun x ultracite fix .` before committing);
  conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Tests     | `bun run test`           | all pass (if plan 001 landed) |
| Dead deps | `bun x knip --no-progress` | fuse.js not listed as unused (it's gone) |

## Scope

**In scope** (all under `apps/bot/src/slack/features/customizations/mcp/`
unless noted):

- `view/tools.ts` (rewrite), `view/index.ts` (re-exports)
- `actions/search-tools.ts` (rewrite), `actions/set-group-mode.ts` (rewrite),
  `actions/toggle-group.ts` (delete)
- `actions/configure.ts`, `actions/reset-tools.ts` (call-site signature only)
- `ids.ts`, `index.ts` (remove toggle-group registration)
- `packages/validators/src/features/mcp/slack.ts`
- `apps/bot/package.json` + `bun.lock` (remove fuse.js)

**Out of scope** (do NOT touch):

- `actions/save-tool-mode.ts`, `actions/helpers.ts`, `block-id.ts` (except
  deleting nothing — keep both encoders), `views/save-tools/`
- `lib/mcp/**`, approval flow, add/connect/delete/toggle server actions
- `packages/db/**` — no query or schema changes in this plan
- Group semantics (`toToolEntries` mapping) and the three-mode enum

## Git workflow

- Branch: `advisor/009-tools-modal-single-flow`
- Conventional commits per step, e.g.
  `refactor: single render flow for MCP tools modal`,
  `feat: enter-triggered substring search for MCP tools`,
  `chore: drop fuse.js`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite `toolsModal` as one pipeline

New signature (drop `open`):

```ts
export function toolsModal({ error, search, serverId, serverName, toolModes, tools }: {
  error?: string;
  search?: string;
  serverId: string;
  serverName: string;
  toolModes: MCPToolModeMap;
  tools: ToolEntry[];
}): ModalView
```

Pipeline, in order:

1. Error branch: keep the existing error Section verbatim (lines 169–177).
2. `const searchTerm = search?.trim().toLowerCase() || undefined;`
   `const visible = searchTerm ? tools.filter((t) => t.name.toLowerCase().includes(searchTerm) || formatToolName(t.name).toLowerCase().includes(searchTerm)) : tools;`
3. Group `visible` with the existing `buildToolsByGroup`.
4. Build rows over `['ro','dt','gn']`: for each non-empty group emit
   `Blocks.Context()` with `*${groupNames[group]}*`, an Actions block
   (`blockId: groupBlock.encode(nonce, group)`) holding the existing
   "Set all…" StaticSelect (`actionId: actions.setGroupMode`), then the
   existing `toolRow` per name — **stopping when a global row budget is
   exhausted**:

   ```ts
   // Slack rejects views over 100 blocks; budget covers header, search,
   // group headers/controls, and the truncation note.
   const MAX_TOOL_ROWS = 85;
   ```

   Count only tool rows against the budget. If `visible.length` exceeds the
   rendered count, append
   `Blocks.Context().elements(`Showing ${rendered} of ${visible.length} tools — search to narrow.`)`.
5. Empty states: no tools at all → keep "No tools were found for this server
   yet."; search with zero matches → keep the "No tools match _term_" Section.
6. Header block (keep): server name + mode explainer + `· N tools` count +
   Reset button with the existing confirmation dialog. Search input block
   (keep) with plain `.dispatchAction()` — **no** `injectCharacterDispatch`.
7. `privateMetaData: JSON.stringify({ nonce, search: searchTerm, serverId, serverName })`
   — no `tools`, no `open`.

Delete: `injectCharacterDispatch`, `toolsLoadingModal`, `defaultOpenGroup`,
`ACCORDION_THRESHOLD`, `MAX_TOOLS_PER_GROUP`, the Fuse import, the accordion
and search-results branches. Keep exports `ToolEntry`, `toToolEntries`,
`toolsModal`; update `view/index.ts` re-exports accordingly.

**Verify**: `bun typecheck` fails only at the known call sites
(`search-tools`, `set-group-mode`, `toggle-group`, `configure`, `reset-tools`)
— fixed in the next steps.

### Step 2: Rewrite `actions/search-tools.ts` (Enter-triggered, single update)

Keep `name = actions.searchTools` and registration under `inputActions`. New
body: ack → parse `serverId` from metadata (`parseToolsMeta`) → `getMCPServerById`
→ `syncToolsForView({ server, teamId: body.team?.id, userId: body.user.id })`
→ one `client.views.update({ hash: view.hash, view_id: view.id, view: toolsModal({ error, search: action.value?.trim() || undefined, serverId, serverName: server.name, toolModes, tools: toolEntries }) })`
with the existing `.catch(() => undefined)`. No loading modal, no hash
chaining. (Slack fires this action on Enter for a `dispatchAction()` text
input by default.)

**Verify**: `bun typecheck` — search-tools compiles.

### Step 3: Rewrite `actions/set-group-mode.ts` (fetch instead of metadata)

Keep `name = actions.setGroupMode`. New body:

1. ack; require `view.id`; parse `{ search, serverId }` from metadata
   (`parseToolsMeta`); require `serverId`.
2. Decode group via existing `groupBlock.decode(action.block_id)` +
   `mcpGroupSlugSchema.safeParse`; mode via `mcpToolModeSchema.safeParse`.
3. `getMCPServerById`; `syncToolsForView` → `{ error, toolEntries, toolModes }`.
   On `error`, render `toolsModal` with the error and return.
4. Target names = `toolEntries` in the decoded group, filtered by the same
   substring predicate as step 1 when `search` is set (two lines — no Fuse).
5. `patchMCPToolModes({ modes, scope: 'global', serverId, teamId, userId })`
   as today, then re-render `toolsModal` with
   `toolModes: { ...toolModes, ...groupModes }` (or re-read via
   `getMCPToolModes` as today — either is acceptable; prefer the merge to
   save a query) and the preserved `search`.

Delete the Fuse import, the `MCPToolsByGroup` rebuild, and the
`allToolEntries` reconstruction.

**Verify**: `bun typecheck` — set-group-mode compiles.

### Step 4: Delete the accordion and fix remaining call sites

1. Delete `actions/toggle-group.ts`.
2. In `index.ts`: remove the `toggleGroup` import and its `buttonActions`
   entry.
3. In `ids.ts`: remove `toggleGroup` from `actions`.
4. In `actions/configure.ts` and `actions/reset-tools.ts`: the `toolsModal`
   calls already pass no `open` — confirm they compile unchanged.

**Verify**: `bun typecheck` → exit 0 across the repo;
`grep -rn "toggleGroup\|toggle-group" apps/bot/src` → no matches.

### Step 5: Shrink the metadata schema

In `packages/validators/src/features/mcp/slack.ts`:

- `mcpToolsMetaSchema` → `{ nonce?, search?, serverId?, serverName? }`
  (remove `open` and `tools`).
- Remove `mcpToolsByGroupSchema` / `MCPToolsByGroup` **only if**
  `grep -rn "MCPToolsByGroup\|mcpToolsByGroupSchema" apps packages` shows no
  remaining consumers after steps 1–4 (`view/tools.ts`'s
  `buildToolsByGroup` should now type its result locally as
  `Record<GroupSlug, string[]>`). Keep `mcpGroupSlugSchema`/`GroupSlug` and
  `mcpToolModeSchema`.

**Verify**: `bun typecheck` → exit 0;
`grep -rn "tools:" apps/bot/src/slack/features/customizations/mcp/view/tools.ts | grep -i privateMeta` → no match (metadata carries no tool list).

### Step 6: Remove fuse.js

Remove `"fuse.js"` from `apps/bot/package.json` dependencies; `bun install`.

**Verify**: `grep -rn "from 'fuse.js'" apps packages` → no matches;
`bun install` exit 0; `bun typecheck`, `bun check`, `bun run test` all exit 0.

## Test plan

If plan 001 has landed, add
`apps/bot/src/slack/features/customizations/mcp/view/tools.test.ts`
(bun:test, pure — `toolsModal` returns a plain object):

- ≤85 tools, no search → every tool rendered, no truncation note, block count
  < 100.
- 120 tools (generated names), no search → exactly 85 tool rows + a context
  block containing "Showing 85 of 120".
- search term matching 3 tools (mixed case, match against formatted name too)
  → 3 rows + count line.
- search term matching nothing → "No tools match" block.
- error set → single error section, no search block.
- `private_metadata` parses as JSON with only
  `nonce`/`search`/`serverId`/`serverName` keys, and its length stays < 500
  for a 200-tool input.

Assert against the built object's `blocks` array (count blocks by `type` /
`block_id` prefixes), not snapshots.

## Done criteria

- [ ] `bun install`, `bun typecheck`, `bun check`, `bun run test` all exit 0
- [ ] `view/tools.ts` has one non-error render path; the strings
      `ACCORDION_THRESHOLD`, `injectCharacterDispatch`, `toolsLoadingModal`,
      `on_character_entered` appear nowhere in the repo
      (`grep -rn` each → no matches)
- [ ] `actions/toggle-group.ts` deleted; no references remain
- [ ] `fuse.js` absent from `apps/bot/package.json` and from imports
- [ ] `private_metadata` of the tools modal contains no tool names
- [ ] Per-tool selects, per-group "Set all…", Reset, and the error view still
      exist (grep for `actions.setGroupMode`, `actions.resetTools`,
      `inputs.toolMode` in `view/tools.ts`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- slack-block-builder's `.dispatchAction()` on a text input does NOT produce
  an Enter-triggered `block_actions` event in a quick dev test — the search
  rewrite depends on Slack's default `on_enter_pressed`; report rather than
  re-adding the JSON-mutation hack.
- Re-rendering after set-group-mode shows stale select values even with a
  fresh nonce — the nonce assumption broke; report.
- `syncToolsForView` semantics changed since `7e2862a` (it must return
  `{ error?, toolEntries, toolModes }` and tolerate failures without throwing).
- Plan 011 already landed and `set-group-mode.ts`/`getMCPToolModes` signatures
  differ from the excerpts — reconcile by reading, and report the merged shape
  you implemented.

## Maintenance notes

- The row budget (85) plus header/search/group blocks must stay under Slack's
  100-block limit; anyone adding blocks to this modal must re-check the
  arithmetic — keep the comment on `MAX_TOOL_ROWS` current.
- Search now costs one MCP `listTools()` fetch per Enter press (same path as
  opening the modal). If that ever feels slow, the fix is caching tool
  definitions server-side, not reintroducing keystroke dispatch.
- Reviewer should scrutinize: the truncation interplay with groups (budget is
  global, groups render in ro→dt→gn order, so 'gn' truncates first — that is
  accepted), and that `set-group-mode` with an active search only writes modes
  for visible (substring-matched) tools.
- Plan 011 (thread-scope removal) edits `set-group-mode.ts` and
  `getMCPToolModes` callers — run it after this plan.
