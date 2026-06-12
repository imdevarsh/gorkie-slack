# Plan 005: Cut per-message MCP toolset latency (parallelize servers, skip redundant writes)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/lib/mcp/remote.ts packages/db/src/queries/mcp/permissions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (test gate), recommended
- **Category**: perf
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

`createMCPToolset` runs on the hot path of **every** Slack message the bot
answers. For each enabled MCP server it sequentially: fetches the credential
(1 DB query + decrypt), opens a fresh MCP client (network handshake), calls
`listTools()` (network round trip), rebuilds tool modes (`ensureMCPToolModes`
= 1 read + 1 unconditional write), reads modes again (`getMCPToolModes`), and
writes `lastConnectedAt` (`updateMCPServer`). With N servers that is N
sequential network handshakes plus ~4–5 DB round trips each (Neon serverless —
per-query latency is material) **before the model can start responding**. A
user with 3 MCP servers pays several seconds of dead time per message. Two
fixes with no behavior change: run the per-server setup concurrently, and skip
the two unconditional writes when nothing changed.

## Current state

- `apps/bot/src/lib/mcp/remote.ts` — `createMCPToolset` (lines 142–258).
  Structure today:

  ```ts
  const servers = await listEnabledMCPServers({ userId });
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const usedNames = new Set<string>();

  for (const server of servers) {
    try {
      const credential = await getMCPCredential({ server, userId });   // DB
      if (!credential) continue;
      const client = await openMCPClient({ credential, server });     // network
      definitions = await client.listTools();                          // network
      clients.push(client);
      await ensureMCPToolModes({ ... });                               // DB read + write
      const modes = await getMCPToolModes({ serverId, threadTs, userId }); // DB
      // ... synchronous tool naming/wrapping into `tools` using usedNames ...
      await updateMCPServer({ id, userId, values: { lastConnectedAt: new Date(), lastError: null } }); // DB write
    } catch (error) {
      logger.warn({ err: error, serverId: server.id, userId }, 'MCP server failed');
    }
  }

  return { cleanup: async () => { await Promise.allSettled(clients.map((c) => c.close())); }, tools };
  ```

  Tool naming (lines 195–203): `mcp_${serverSlug}_${slugify(toolName)}` with a
  collision counter against `usedNames`. **Naming must stay deterministic
  across messages** — the model's tool-call history and thread permissions
  reference these names.

- `packages/db/src/queries/mcp/permissions.ts` — `ensureMCPToolModes`
  (lines 137–163): reads current global modes, builds
  `next[toolName] = current.global[toolName] ?? defaultMode` for the live tool
  list, then **always** calls `setMCPToolModes` (an upsert), even when `next`
  is identical to `current.global`. The always-rebuild semantics (prune removed
  tools, add new ones) are intentional — commit `6a361a8` — keep them; only
  skip the write when the result is identical.

- `listEnabledMCPServers` returns full server rows including `lastConnectedAt`
  (schema `packages/db/src/schema/mcp.ts` — `mcpServers.lastConnectedAt`
  timestamp, `lastError` text) — so the throttle in step 3 needs no extra query.

- Conventions (AGENTS.md): inline over extract — keep the per-server logic
  inside `createMCPToolset` as an inner async closure, do not create a new
  module; dict params; Ultracite/Biome.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |
| Tests     | `bun run test`           | all pass            |

## Scope

**In scope**:

- `apps/bot/src/lib/mcp/remote.ts` (restructure `createMCPToolset` only —
  `getMCPCredential`, `openMCPClient`, `fetchTools`, `syncMCPToolModes`
  stay as-is)
- `packages/db/src/queries/mcp/permissions.ts` (`ensureMCPToolModes` only)

**Out of scope** (do NOT touch):

- Cross-message MCP client/toolset caching. It is the bigger win but has a
  real lifecycle problem (when to invalidate on server config change, token
  refresh, tool-list drift) and was deliberately deferred — note it, don't
  build it.
- `wrapper.ts`, `connection.ts`, `oauth-provider.ts`, approval code.
- `getMCPToolModes`, `setMCPToolModes`, `patchMCPToolModes` signatures.
- Any change to exposed tool names or mode-precedence logic
  (`block` global overrides thread — lines 207–211 of remote.ts).

## Git workflow

- Branch: `advisor/005-mcp-toolset-performance`
- Conventional commit, e.g. `perf: parallelize MCP server setup and skip redundant mode writes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split per-server setup into a concurrent phase and a serial assembly phase

Restructure `createMCPToolset` into two phases:

**Phase A (concurrent)** — for each server, an inner async closure does the
I/O and returns a result object; run with `Promise.all` over closures that
catch their own errors (preserving today's per-server `logger.warn` and
continue-on-failure semantics):

```ts
const setups = await Promise.all(
  servers.map(async (server) => {
    try {
      const credential = await getMCPCredential({ server, userId });
      if (!credential) return null;
      const client = await openMCPClient({ credential, server });
      let definitions: ListToolsResult;
      try {
        definitions = await client.listTools();
      } catch (err) {
        await client.close().catch(() => undefined);
        throw err;
      }
      await ensureMCPToolModes({ ... });           // unchanged args
      const modes = await getMCPToolModes({ ... }); // unchanged args
      return { client, definitions, modes, server };
    } catch (error) {
      logger.warn({ err: error, serverId: server.id, userId }, 'MCP server failed');
      return null;
    }
  })
);
```

**Phase B (serial, synchronous)** — iterate `setups` **in the original
`servers` order**, skipping nulls: push clients, then do the existing naming /
collision / wrapping logic verbatim against the shared `usedNames` set. Because
`Promise.all` preserves input order and naming happens only in phase B,
exposed names remain deterministic regardless of which server resolved first.

The `lastConnectedAt` update moves into phase A's closure (it is per-server
and independent) — but apply step 3's throttle when you move it.

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0. Then confirm by
reading: (a) naming runs only in phase B in `servers` order; (b) a failed
server still closes its client and doesn't abort the others; (c) `cleanup`
still closes every client pushed.

### Step 2: Skip the no-op write in `ensureMCPToolModes`

In `packages/db/src/queries/mcp/permissions.ts`, after computing `next`,
return early without calling `setMCPToolModes` when `next` is identical to
`current.global` — same key set, same values:

```ts
const currentGlobal = current.global;
const currentKeys = Object.keys(currentGlobal);
const unchanged =
  currentKeys.length === toolNames.length &&
  toolNames.every((toolName) => currentGlobal[toolName] === next[toolName]);
if (unchanged) {
  return next;
}
```

Careful: equality must require the **same key count** (a pruned tool means
`currentKeys.length !== toolNames.length` → write) and identical mode for
every live tool. Duplicate names in `toolNames` would break the length check —
if you find duplicates possible, dedupe `toolNames` first and note it.

**Verify**: `bun typecheck` → exit 0. If plan 001 landed, add unit tests (see
Test plan).

### Step 3: Throttle the `lastConnectedAt` write

In the phase-A closure, replace the unconditional `updateMCPServer` with:

```ts
const CONNECTED_AT_REFRESH_MS = 5 * 60 * 1000;
const needsTouch =
  server.lastError !== null ||
  !server.lastConnectedAt ||
  Date.now() - server.lastConnectedAt.getTime() > CONNECTED_AT_REFRESH_MS;
if (needsTouch) {
  await updateMCPServer({ id: server.id, userId, values: { lastConnectedAt: new Date(), lastError: null } });
}
```

(Module-scope constant per repo convention.) This keeps the App Home's
"Active" freshness within 5 minutes while removing a write from every message.
The `lastError !== null` clause preserves today's behavior of clearing a stale
error as soon as a connection succeeds.

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0.

## Test plan

- If plan 001 landed: `ensureMCPToolModes` is DB-bound and not unit-testable
  without a harness, so extract nothing — instead test the equality logic
  indirectly is NOT required; required tests are none. Optional: none.
  (Honest statement: this plan's safety rests on typecheck + the three
  reading checks in step 1's verify.)
- Manual validation recipe for the operator (include in your report): with 2+
  MCP servers connected in a dev workspace, send a message and compare
  time-to-first-status against the previous build; confirm tool names in the
  thinking panel are unchanged; toggle a tool mode in App Home and confirm it
  still takes effect on the next message (the ensure/skip path).

## Done criteria

- [ ] `bun typecheck` exits 0; `bun check` exits 0; `bun run test` exits 0
- [ ] `createMCPToolset` does per-server I/O via `Promise.all` (phase A) and
      naming/wrapping serially in `servers` order (phase B)
- [ ] `ensureMCPToolModes` returns early on identical modes (no
      `setMCPToolModes` call)
- [ ] `updateMCPServer` in the toolset path is gated by the 5-minute throttle
- [ ] Exposed tool-name generation code is character-identical to before
      (`git diff` shows the naming block moved, not edited)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Anything else mutates shared state inside the current loop that I did not
  list (re-read the live loop body first; if a new side effect appeared since
  `7e2862a`, parallelizing may reorder it).
- `ensureMCPToolModes` has grown callers beyond `remote.ts` and
  `connection.ts` (`grep -rn "ensureMCPToolModes" apps packages`) whose
  semantics depend on the unconditional write timestamp.
- You are tempted to cache clients/toolsets across messages — out of scope;
  report the idea instead.

## Maintenance notes

- The deferred follow-up is cross-message toolset caching keyed by
  `(userId, serverId, server.updatedAt)` with explicit invalidation on
  connect/disconnect/delete — worth a design pass once latency matters again.
- If MCP servers ever become numerous per user, bound phase A's concurrency
  (e.g. chunked `Promise.all`) — unbounded is fine at today's single-digit
  counts.
- Reviewer should scrutinize phase-B ordering and the `unchanged` equality
  (key count + per-key) — those are the two spots a subtle regression hides.
