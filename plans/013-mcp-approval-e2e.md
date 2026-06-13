# Plan 013: MCP fixture server + approval-flow e2e scenarios

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 9097a7a..HEAD -- apps/bot/src/lib/mcp apps/bot/src/slack/events/message-create/utils apps/bot/src/slack/features/customizations/mcp packages/db/src/queries/mcp packages/utils/src/guarded-fetch.ts`
> Plan 012 must be DONE first (this plan extends its harness). If plans 003,
> 005, or 011 have landed since `9097a7a`, the approval/permission excerpts
> below may be stale — re-verify each excerpt against live code; on a
> mismatch you don't understand, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM — one production seam is a guarded SSRF-check bypass that
  must be impossible to enable outside tests
- **Depends on**: 012 (hard). Recommended order: after 012, **before** 003,
  005, and 011 (it is their safety net; see maintenance notes)
- **Category**: tests (e2e) / security-sensitive seam
- **Planned at**: commit `9097a7a`, 2026-06-12

## Why this matters

The MCP approval flow is the most intricate state machine in the bot — and
the place the maintainer's own notes (GOAL.md, BUGS.md) report the most
bugs: pauses that don't resume, approvals superseded incorrectly, servers
auto-disconnecting on auth failures. The pipeline crosses **five layers**:

agent stream (`tool-approval-request` parts) → DB persistence
(`mcp_tool_approvals`) → a Slack message with buttons → a `block_actions`
round-trip → `resumeResponse` re-running the agent with
`tool-approval-response` messages.

No test exercises any of it. Plans 003 (resume recovery) and 011 (permission
semantics change) will rewrite parts of it; without this plan they ship
blind.

With plan 012's harness, every layer is drivable offline: the scripted model
emits the MCP tool call, the fake Slack records the approval message, and
`app.processEvent` can inject the button click. The only missing pieces are
(a) a real MCP server for the bot to call — a local fixture — and (b) a way
past the SSRF guard that (correctly) blocks loopback URLs.

## Current state (all verified at `9097a7a`)

- **Default tool mode is `ask`**: `apps/bot/src/config.ts:87`
  (`defaultToolMode: 'ask'`), consumed in `apps/bot/src/lib/mcp/remote.ts`
  (`export const defaultToolMode`). So a freshly connected server's tools
  require approval — exactly what the scenario needs; no mode seeding
  required beyond the defaults `ensureMCPToolModes` writes.
- **Toolset assembly**: `createMCPToolset` (`remote.ts`) reads
  `listEnabledMCPServers({ userId, teamId })` from Postgres, resolves a
  credential per server (`getMCPCredential` — for `authType: 'bearer'` it
  reads `getMCPConnection` and `decrypt`s the stored token, using
  `apps/bot/src/lib/mcp/encryption.ts` `encrypt`/`decrypt`, AES-256-GCM keyed
  by `MCP_ENCRYPTION_KEY`), then `createMCPClient` (`@ai-sdk/mcp`) with
  `transport: { type: 'http' | 'sse', url: server.url, fetch: guardedMCPFetch, redirect: 'error', headers: { Authorization: Bearer ... } }`.
- **The SSRF guard blocks the fixture**: `guardedMCPFetch`
  (`apps/bot/src/lib/mcp/guarded-fetch.ts`) wraps
  `createGuardedFetch({ maxResponseBytes, timeoutMs })` from
  `packages/utils/src/guarded-fetch.ts:36-68`, which re-validates **every
  request URL** via `mcpServerUrlSchema`
  (`packages/validators/src/features/mcp/url.ts`): HTTPS-only and loopback /
  private ranges rejected. `http://127.0.0.1:PORT` fails twice over.
- **Approval surfacing**: orchestrator stream parts of type
  `tool-approval-request` are collected by `consumeOrchestratorStream`
  (`apps/bot/src/lib/ai/agents/orchestrator.ts:51-78`) — only those whose
  `toolCall.toolMetadata` carries `mcp.server`/`mcp.tool` (set by
  `wrapMCPToolExecute` metadata in `remote.ts`). `runAgent`
  (`utils/respond.ts`) then calls `pauseForApprovals`
  (`utils/approval-flow.ts`), which per approval: `recordApprovalTask` +
  `postApprovalRequest` (`utils/approval-helpers.ts`) — the latter persists
  via `createMCPToolApproval` (with the **conversation messages + hints
  encrypted into a `state` blob**, see `decodeApprovalState`) and posts a
  Slack message whose buttons carry `action_id`s from
  `apps/bot/src/slack/features/customizations/mcp/ids.ts`:
  `approval.allow` = `'approval.allow'`, `approval.always` =
  `'approval.always'`, `approval.deny` = `'approval.deny'`, each with
  `value` = the approval id.
- **Button handling**: `customizations.buttonActions` registers all three
  action ids to `mcp/actions/approval.ts#execute`, wired via
  `app.action(name, execute)` in `apps/bot/src/slack/app.ts`. The handler:
  `ack()` → `getMCPToolApprovalStatus` → permission check
  (`status.userId !== body.user.id` → ephemeral rejection) → claim/finalize
  (`claimMCPToolApproval`, `finalizeMCPToolApprovalInBatch`) →
  `decodeApprovalState` → `resumeResponse`
  (`utils/resume.ts`) which re-runs `runAgent` with an appended
  `role: 'tool'` message containing
  `{ type: 'tool-approval-response', approvalId, approved, reason? }`.
  It also `chat.update`s the approval message via `handledApprovalBlocks`.
  Note it reads `body.container.channel_id`, `body.message.ts`,
  `body.user.id`, and `action.value` — the injected payload must carry all
  of these.
- **DB seeding surface** (`packages/db/src/queries/mcp/`):
  `createMCPServer(server: NewMCPServer)` (servers.ts:22),
  `upsertMCPBearerConnection(...)` (connections.ts:121). Read both
  signatures plus the `NewMCPServer` schema type before seeding; required
  fields include `userId`, `teamId`, `name`, `url`, `transport`,
  `authType`, `enabled`.
- **MCP server fixture options**: the repo has no MCP server dependency.
  `@modelcontextprotocol/sdk` provides `McpServer` +
  `StreamableHTTPServerTransport`, which `@ai-sdk/mcp`'s `http` transport
  speaks. Add it as a **devDependency of `apps/bot`** only.

## Commands you will need

Same as plan 012 (install, typecheck, check, spelling, docker Postgres,
`db:push`), plus `cd apps/bot && bun test test/e2e/mcp` for the new file.

## Scope

**In scope**:

- `packages/utils/src/guarded-fetch.ts` — add an explicit, double-gated
  loopback allowance (step 1)
- `apps/bot/src/lib/mcp/guarded-fetch.ts` — wire the gate from env
- `apps/bot/src/env.ts` — add the gate env var
- `apps/bot/package.json` — add `@modelcontextprotocol/sdk` devDependency
- New: `apps/bot/test/e2e/harness/fake-mcp.ts`
- New: `apps/bot/test/e2e/harness/seed.ts` (DB seeding + cleanup helpers)
- New: `apps/bot/test/e2e/mcp-approval.test.ts`
- `apps/bot/test/e2e/harness/env.ts` and `harness/index.ts` — minimal
  extensions (set the gate var; add a `sendBlockAction` injector)
- `plans/README.md` status row
- cspell config only if new words flag

**Out of scope** (do NOT touch):

- `remote.ts`, `wrapper.ts`, `approval.ts`, `approval-helpers.ts`,
  `resume.ts`, `respond.ts` — this plan tests them, it does not change them.
  If a scenario reveals a bug, write the test as a characterization of
  current behavior, name it `characterization:`, and report the bug — do not
  fix it here.
- OAuth flows (`oauth-provider.ts`, OAuth connect modal) — bearer only.
  OAuth e2e needs an authorization-server fixture; defer.
- The App Home / connect-modal UI flows — see "Deferred ideas" in
  `plans/README.md`.
- `mcpServerUrlSchema` in `packages/validators` — the modal-time validation
  stays exactly as is; only the per-request guard gets the test gate.

## Git workflow

- Branch: `advisor/013-mcp-approval-e2e`
- Conventional commits, e.g. `test: add mcp fixture and approval flow e2e`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The guard seam (security-sensitive — follow exactly)

`createGuardedFetch` currently validates every URL with
`mcpServerUrlSchema.parseAsync`. Add an opt-in loopback allowance that is
**off by default, requires two independent switches, and never widens beyond
loopback**:

1. In `packages/utils/src/guarded-fetch.ts`, extend the options:

```ts
export function createGuardedFetch({
  allowLoopback = false,
  maxResponseBytes,
  timeoutMs,
}: {
  allowLoopback?: boolean;
  maxResponseBytes?: number;
  timeoutMs: number;
}): GuardedFetch {
```

   When `allowLoopback` is true and the URL's hostname is exactly
   `127.0.0.1`, `::1`, or `localhost`, skip `mcpServerUrlSchema.parseAsync`
   and use the URL as-is (still apply timeout + size limits). Everything
   else goes through the schema unchanged.

2. In `apps/bot/src/env.ts`, add:
   `MCP_ALLOW_LOOPBACK: z.coerce.boolean().optional().default(false)`
   — but gate it so it cannot be enabled in production:

```ts
MCP_ALLOW_LOOPBACK: z.coerce
  .boolean()
  .optional()
  .default(false),
```

3. In `apps/bot/src/lib/mcp/guarded-fetch.ts`:

```ts
export const guardedMCPFetch = Object.assign(
  createGuardedFetch({
    allowLoopback: env.NODE_ENV === 'test' && env.MCP_ALLOW_LOOPBACK,
    maxResponseBytes: mcp.maxResponseBytes,
    timeoutMs: mcp.requestTimeoutMs,
  }),
  { preconnect: fetch.preconnect }
);
```

   The conjunction is the point: `NODE_ENV=test` **and** the explicit flag.
   A production deploy with a stray `MCP_ALLOW_LOOPBACK=1` stays guarded.
   (Reminder from `apps/bot/src/env.ts`: `z.coerce.boolean()` turns the
   string `'false'` into `true` — the harness must set `'1'` or leave unset,
   never `'false'`.)

**Verify**: `bun typecheck` → 0; `bun check` → 0. Grep the diff: the schema
path for non-loopback hosts must be byte-identical to before.

### Step 2: MCP fixture (`harness/fake-mcp.ts`)

Add `@modelcontextprotocol/sdk` to `apps/bot` **devDependencies**
(`bun add -d @modelcontextprotocol/sdk` from `apps/bot`).

Build a fixture exposing **one tool** over Streamable HTTP with bearer auth:

```ts
export interface FakeMCP {
  url: string; // http://127.0.0.1:<port>/mcp
  token: string; // expected bearer token
  toolCalls: { name: string; args: unknown }[]; // recorded invocations
  setAuthMode(mode: 'ok' | 'reject'): void; // 'reject' → 401 (chaos)
  reset(): void;
  stop(): void;
}
```

Implementation sketch: an `McpServer` with
`server.registerTool('get_summary', { description: 'Get a summary', inputSchema: { topic: z.string() } }, handler)`
where the handler records the call and returns
`{ content: [{ type: 'text', text: 'SUMMARY:<topic>' }] }`. Serve it via
`StreamableHTTPServerTransport` behind `Bun.serve` (or `node:http` if the
SDK's transport requires Node req/res objects — check the SDK's docs/types
in `node_modules/@modelcontextprotocol/sdk` and use whichever the transport
actually supports; this is mechanical, not a design decision). Before
handing a request to the transport, check
`Authorization === 'Bearer ' + token`; in `reject` mode or on mismatch,
respond `401` with body `{"error":"unauthorized"}`.

**Verify** with a throwaway script (delete after): `createMCPClient` from
`@ai-sdk/mcp` pointed at the fixture lists one tool and can call it.

### Step 3: Seeding (`harness/seed.ts`)

```ts
export async function seedBearerServer({ fakeMCP }: { fakeMCP: FakeMCP }) {
  // dynamic-import @repo/db/queries and @/lib/mcp/encryption AFTER applyTestEnv
  const server = await createMCPServer({
    userId: 'U0HUMAN',
    teamId: 'TTEST',
    name: 'Fixture',
    url: fakeMCP.url,
    transport: 'http',
    authType: 'bearer',
    enabled: true,
    // fill remaining required NewMCPServer fields per the schema type
  });
  await upsertMCPBearerConnection({
    serverId: server.id,
    userId: 'U0HUMAN',
    token: encrypt(fakeMCP.token),
    // per the actual signature
  });
  return server;
}

export async function cleanupMCP() {
  // delete mcp approval/connection/mode/server rows for U0HUMAN
  // use existing delete queries (deleteMCPServer cascades? verify) or raw
  // drizzle deletes scoped to the test user
}
```

Read the actual schema/signatures first (`packages/db/src/schema`,
`queries/mcp/servers.ts`, `connections.ts`); the field lists above are
indicative, not gospel. `seedBearerServer` runs in `beforeEach` (after
`cleanupMCP`) so each test starts clean.

Note `url` validation: `createMCPServer` may or may not re-validate the URL
(the zod URL schema lives in the modal flow, and plan 004 — if executed —
moved enforcement into the query layer). If the insert rejects the
`http://127.0.0.1` URL, see STOP conditions.

### Step 4: Harness extensions

1. `harness/env.ts`: add `MCP_ALLOW_LOOPBACK: '1'` to the defaults.
2. `harness/index.ts`: boot the fixture alongside the other fakes and expose
   it on `Harness`; add a `block_actions` injector:

```ts
const sendBlockAction = async ({
  actionId,
  value,
  channel,
  messageTs,
  user = 'U0HUMAN',
}: {
  actionId: string;
  value: string;
  channel: string;
  messageTs: string;
  user?: string;
}) => {
  await app.processEvent({
    ack: () => Promise.resolve(),
    body: {
      type: 'block_actions',
      token: 'test-token',
      team: { id: 'TTEST', domain: 'test' },
      user: { id: user, team_id: 'TTEST' },
      api_app_id: 'A0TEST',
      trigger_id: 'trigger.test',
      container: {
        type: 'message',
        channel_id: channel,
        message_ts: messageTs,
        is_ephemeral: false,
      },
      channel: { id: channel, name: 'general' },
      message: { type: 'message', ts: messageTs, text: '' },
      response_url: 'http://127.0.0.1:1/response',
      actions: [
        {
          type: 'button',
          action_id: actionId,
          block_id: 'b0',
          value,
          action_ts: '1700000000.000001',
        },
      ],
    },
    retryNum: undefined,
    retryReason: undefined,
  });
};
```

   The handler reads `action.value` (approval id), `body.user.id`,
   `body.container.channel_id`, `body.message.ts` — all present above. If
   Bolt's payload matcher rejects this shape, compare against
   `@slack/bolt`'s `BlockAction` type and fill the missing required fields.

3. `fake-slack.ts`: the approval message is posted via `chat.postMessage`
   with blocks; `postApprovalRequest` then stores the returned `ts` as
   `messageTs`. The fake already returns incrementing `ts` values — expose a
   helper `lastCallTo(method)` to fetch the approval message's recorded body
   and its assigned `ts` (extend `RecordedCall` to include the `ts` the fake
   returned, so tests can correlate).

### Step 5: The headline scenario (`mcp-approval.test.ts`)

**Scenario A — approve and resume.**

1. Seed the bearer server. Script the provider with two turns:
   - turn 1: tool call to the **exposed MCP tool name**. Determine it
     empirically: it is built in `remote.ts` from `slugify(server.name)` +
     the tool name (read the exact concatenation in `createMCPToolset` /
     `wrapMCPToolExecute` call site — search for `exposedName`). For a
     server named `Fixture` and tool `get_summary`, expect something like
     `fixture_get_summary`. Assert the exact exposed name by first checking
     `body.tools` of the provider request (the harness records it), then
     hardcode it in the script.
   - turn 2: `reply` with `content: ['Summary delivered']`.
2. `await h.sendMessage(dmEvent({ text: 'summarize x' }))`. The agent run
   pauses: assert
   - a `chat.postMessage` whose blocks contain buttons with action ids
     `approval.allow` / `approval.always` / `approval.deny`;
   - the fixture has **zero** recorded tool calls (nothing ran
     pre-approval);
   - a `chat.appendStream` plan-title chunk `'Needs Approval'`;
   - one row in `mcp_tool_approvals` with status `pending` (query via
     `getMCPToolApprovalStatus` or drizzle directly).
3. Extract the approval id from the recorded button `value` and the message
   `ts` from the recorded call; inject
   `sendBlockAction({ actionId: 'approval.allow', value: approvalId, channel: 'D0TEST', messageTs })`.
4. Assert, polling with the `waitFor` helper (the resume runs through the
   per-context queue and may outlive `processEvent`'s promise):
   - the fixture recorded exactly one `get_summary` call with the scripted
     args;
   - a second provider request whose `body.messages` includes the MCP tool
     result text `SUMMARY:`;
   - a final `chat.postMessage` with `markdown_text: 'Summary delivered'`;
   - the approval row's status is no longer `pending`;
   - the approval message was `chat.update`d (handled blocks).

**Scenario B — deny.** Same setup; click `approval.deny`; script turn 2 as
`reply` with any content. Assert the fixture recorded **zero** tool calls,
the second provider request carries a `tool-approval-response` with
`approved: false` (inspect `body.messages`), and a reply was still posted.

**Scenario C — wrong user.** Click `approval.allow` with
`user: 'U0INTRUDER'`. Assert a `chat.postEphemeral` rejection was recorded,
the approval row is still `pending`, and the fixture ran nothing.

**Scenario D (chaos) — token revoked mid-flight.** Seed; script turn 1 as
the MCP tool call; approve; but call `fakeMCP.setAuthMode('reject')`
**before** clicking approve. Script turn 2 as `reply`. Assert the run
completes (a reply is posted — no hang), and **characterize** what happens
to the server row: GOAL.md reports the server gets auto-disconnected /
`lastError` set inconsistently. Whatever the current behavior is, pin it in
a `characterization:`-named test and report it; do not fix.

**Verify**: `cd apps/bot && bun test test/e2e` → all (012's + these) pass.
Full gate: `bun x ultracite fix .`, `bun check`, `bun typecheck`,
`bun run check:spelling`.

## Test plan

Scenarios A–D above, plus 012's suite staying green (the fixture must not
leak state between files — `cleanupMCP` in `beforeEach`).

## Done criteria

- [ ] All four scenarios pass offline against the dockerized Postgres
- [ ] The guard bypass requires BOTH `NODE_ENV=test` and
      `MCP_ALLOW_LOOPBACK=1` (assert by reading the final diff of
      `guarded-fetch.ts` wiring), and non-loopback URLs still validate
- [ ] `@modelcontextprotocol/sdk` appears only in `apps/bot`
      `devDependencies`
- [ ] `bun typecheck`, `bun check`, `bun run check:spelling` exit 0
- [ ] No production behavior change with the new env vars unset
- [ ] `plans/README.md` status row updated; any characterization findings
      from scenario D reported in the completion notes

## STOP conditions

- Plan 012 is not DONE (no harness to extend).
- `createMCPServer` (or a query-layer validator from plan 004) rejects the
  loopback URL at insert time. Do not weaken the validator — report back;
  the likely resolution is seeding via raw drizzle insert in the test
  helper, but that decision belongs to the maintainer/reviewer.
- `@ai-sdk/mcp`'s client and `@modelcontextprotocol/sdk`'s server transport
  can't complete a handshake (version mismatch). Report the exact error and
  both package versions; do not vendor a hand-rolled MCP protocol
  implementation.
- The approval `block_actions` payload is rejected by Bolt's matcher after
  filling all documented fields — report the validation error verbatim.
- Scenario A's resume never produces the second provider request within the
  `waitFor` timeout: this may be a REAL bug (plan 003's territory). Pin
  whatever does happen as a characterization test, mark this plan BLOCKED on
  the report, and reference plan 003.

## Maintenance notes

- **Run before plans 003, 005, 011.** Those plans rewrite approval/resume/
  permission code; these scenarios are their regression net. Plan 011
  changes "always allow" semantics — when it lands, scenario expectations
  involving `approval.always` (if any get added later) must change with it,
  and 011's executor should run `bun run test:e2e` as part of its gate.
- The `allowLoopback` seam is the one piece of this plan with security
  weight. Reviewers of ANY future change to `guarded-fetch.ts` (either file)
  must confirm the conjunction gate survives. If the repo later gains a
  config-validation step for production deploys, assert `MCP_ALLOW_LOOPBACK`
  is unset there too.
- Scenario D's characterization doubles as the executable spec for the
  GOAL.md "MCP gets auto-disconnected on VALID authorization failure" issue
  — when someone fixes that, they flip the characterization into the desired
  assertion.
- OAuth-flow e2e (authorization-code dance against a fixture IdP) and the
  connect-modal UI flow (`view_submission` injection asserting `views.*`
  payloads) are natural follow-ups on this foundation; see "Deferred ideas"
  in `plans/README.md`.
