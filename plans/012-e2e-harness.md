# Plan 012: Offline e2e harness — fake Slack + scripted model, full bot loop in-process

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 9097a7a..HEAD -- apps/bot/src/env.ts apps/bot/src/slack/app.ts packages/ai/src/keys.ts packages/ai/src/providers.ts apps/bot/src/slack/events/message-create apps/bot/src/lib/ai turbo.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (large M — most of the effort is the two fake servers)
- **Risk**: LOW for production code (three tiny, default-preserving seams);
  MEDIUM for the harness itself (SSE format details)
- **Depends on**: 001 (soft — reuses its test scripts; instructions below
  work whether or not 001 has run)
- **Category**: tests (e2e)
- **Planned at**: commit `9097a7a`, 2026-06-12

## Why this matters

The bot's riskiest code — the Bolt event pipeline, the `ToolLoopAgent`
orchestrator loop, tool execution, Slack streaming UI updates, and the
provider retry chain — has **zero automated coverage**. Plan 001 covers pure
functions only. Every behavioral plan in this directory (002, 003, 005, 011)
changes this pipeline with no safety net.

This repo is unusually e2e-able **offline** because of three architectural
facts (all verified at the planned commit):

1. **The model is just an HTTP endpoint.** `packages/ai/src/providers.ts`
   builds every model from OpenRouter-compatible providers
   (`createOpenRouter`), and `OPENROUTER_BASE_URL` is already overridable via
   env. A local fake server that speaks OpenAI-style
   `POST /chat/completions` (SSE) can script the model's behavior
   deterministically: which tools it calls, with what arguments, in what
   order.
2. **Tool calls ARE the observable output.** The agent ends its loop via the
   `reply` / `skip` / `leaveChannel` tools (`stopWhen` in
   `apps/bot/src/lib/ai/agents/orchestrator.ts:113-118`), and `reply` posts
   via `chat.postMessage`. So "did the bot answer correctly" is a concrete
   assertion against a recorded Slack API call, not LLM-output fuzz.
3. **Events can be injected without Slack.** Bolt's `app.processEvent()`
   accepts a raw `event_callback` envelope; no Socket Mode, no HTTP receiver,
   no signature needed. The promise resolves after all listeners finish
   (`execute` in `message-create/index.ts` awaits the queued
   `handleMessage`).

A fourth property makes scenarios cheap: because the **fake model decides
which tools run**, scenarios never touch Exa, E2B, AgentMail, or image
generation unless a scenario explicitly scripts those tool calls. Dummy API
keys satisfy env validation (`apps/bot/src/env.ts` only checks prefixes/min
length) and the code paths are simply never reached.

What stands between today and that harness: two missing env seams (the
hackclub provider base URL is hardcoded; the Slack `WebClient` base URL is
not configurable), and the harness code itself. That is this plan.

## Current state

- **No e2e or integration tests exist.** All `*.test.ts` under the repo are
  in `opencode-src/` (vendored, out of scope). Plan 001 (if already executed)
  adds unit tests colocated under `src/`.
- `apps/bot/src/slack/app.ts:37-75` — `createSlackApp()` builds the Bolt
  `App` with `token` + `signingSecret` (+ `appToken`/`socketMode` when
  `SLACK_SOCKET_MODE`). **No `clientOptions` is passed**, so the `WebClient`
  always targets `https://slack.com/api/`.
- `apps/bot/src/env.ts` — schema includes `SLACK_BOT_TOKEN`,
  `SLACK_SIGNING_SECRET`, `SLACK_SOCKET_MODE`
  (`z.coerce.boolean().optional().default(false)` — **note: the string
  `'false'` coerces to `true`; leave it unset in tests**), `EXA_API_KEY`
  (min 1), `E2B_API_KEY` (min 1), `AGENTMAIL_API_KEY` (must start `am_`),
  `SERVER_BASE_URL` (url), `MCP_ENCRYPTION_KEY` (min 32). It `extends`
  `@repo/ai/keys` (`HACKCLUB_API_KEY` must start `sk-hc-`,
  `OPENROUTER_API_KEY` must start `sk-`, `OPENROUTER_BASE_URL` optional url),
  `@repo/db/keys` (`DATABASE_URL` url), `@repo/logging/keys` (`LOG_LEVEL`,
  `LOG_DIRECTORY`, both defaulted). Env is validated **at import time** of
  `@/env` (and `packages/ai/src/providers.ts` validates its own keys at
  import). `import 'dotenv/config'` runs first but dotenv never overwrites
  already-set vars — so the harness setting `process.env` before importing
  app modules wins.
- `packages/ai/src/providers.ts:12-15`:

```ts
const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});
```

  and lines 17-20:

```ts
const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL ?? undefined,
});
```

  The chat model retry chain (`createRetryable`, lines ~57-65): primary
  `hackclub('google/gemini-3-flash-preview')`, then retries
  `hackclub('openai/gpt-5.4-mini')`,
  `openrouter('google/gemini-3-flash-preview')`,
  `openrouter('openai/gpt-5.4-mini')` (each retry entry: `maxAttempts: 2`,
  `delay: 250`, `backoffFactor: 2`).
- `apps/bot/src/slack/events/message-create/index.ts` — `execute()` filters
  subtypes, builds the message context, resolves the trigger
  (`@/utils/triggers.ts`: mention of `<@BOT_USER_ID>` → `ping`;
  `channel_type === 'im'` → `dm`), then awaits
  `getQueue(ctxId).add(() => handleMessage(...))`.
- `handleMessage` → `buildChatContext` (reads thread history via
  `conversations.replies` / `conversations.history`, user names via
  `users.info`, and per-user customization prompts from **Postgres**) →
  `generateResponse`/`runAgent` (`utils/respond.ts`) → `initStream`
  (`chat.startStream`, `apps/bot/src/lib/ai/utils/stream.ts:40`) →
  `orchestratorAgent` → `ToolLoopAgent.stream()` → per-step `createTask`
  ("Thinking…") chunks via `chat.appendStream` → tools execute (e.g. `reply`
  loops `chat.postMessage` with `markdown_text`, one call per content line —
  `apps/bot/src/lib/ai/tools/chat/reply.ts:135-141`) → `closeStream`
  (`chat.stopStream`) → `assistant.threads.setStatus` (status cleared).
- `apps/bot/src/lib/allowed-users.ts` — when `OPT_IN_CHANNEL` is **unset**,
  `buildCache` returns immediately and `isUserAllowed` always returns true.
  Leave it unset in tests.
- `createMCPToolset` (`apps/bot/src/lib/mcp/remote.ts`) reads
  `listEnabledMCPServers` from Postgres; with empty tables it contributes no
  tools. So the harness needs a real (disposable) Postgres with the schema
  pushed, but no seed data.
- The bot does **not** use Redis (`@repo/kv` has no consumers in `apps/bot`).
  Telemetry, the sandbox janitor, and the task runner are started only by
  `apps/bot/src/index.ts` — the harness imports `createSlackApp` directly and
  never triggers them.
- Test scripts: if plan 001 has run, `apps/bot/package.json` has
  `"test": "bun test"`; root has `"test": "turbo run test"`; `turbo.json` has
  a `test` task; CI has a `test` job. If 001 has NOT run, none of these
  exist.

## Commands you will need

| Purpose        | Command                                                        | Expected |
|----------------|----------------------------------------------------------------|----------|
| Install        | `bun install`                                                  | exit 0   |
| Typecheck      | `bun typecheck`                                                | exit 0   |
| Lint           | `bun check` (autofix: `bun x ultracite fix .`)                 | exit 0   |
| Spelling       | `bun run check:spelling`                                       | exit 0   |
| Disposable DB  | `docker run -d --name gorkie-e2e-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gorkie_e2e -p 5433:5432 postgres:17` | container id |
| Push schema    | `DATABASE_URL=postgres://postgres:postgres@localhost:5433/gorkie_e2e bun run db:push` | exit 0 |
| Run e2e        | `cd apps/bot && bun test test/e2e`                             | all pass |

## Scope

**In scope** (the only files you may create or modify):

Production seams (tiny, default-preserving):

- `apps/bot/src/env.ts` — add `SLACK_API_URL: z.url().optional()`
- `apps/bot/src/slack/app.ts` — pass `clientOptions` when `SLACK_API_URL` set
- `packages/ai/src/keys.ts` — add `HACKCLUB_BASE_URL: z.url().optional()`
- `packages/ai/src/providers.ts` — use the override for the hackclub baseURL

Harness + tests (new files):

- `apps/bot/test/e2e/harness/env.ts`
- `apps/bot/test/e2e/harness/fake-slack.ts`
- `apps/bot/test/e2e/harness/fake-provider.ts`
- `apps/bot/test/e2e/harness/index.ts`
- `apps/bot/test/e2e/core-flow.test.ts`
- `apps/bot/test/e2e/provider-fallback.test.ts`

Wiring:

- `apps/bot/package.json` (scripts)
- root `package.json` (scripts)
- `turbo.json` (`test:e2e` task)
- `.github/workflows/ci.yml` (`e2e` job)
- `.cspell.jsonc` / `tooling/cspell/**` only if spelling flags new words
- `DEVELOPMENT.md` — short "Running e2e tests" section

**Out of scope** (do NOT touch):

- Any tool implementation, the orchestrator, `respond.ts`, the queue, MCP
  code — this plan observes behavior; it changes none.
- MCP scenarios and the approval flow — that is plan 013.
- The `socketMode: true` branch of `createSlackApp` beyond passing
  `clientOptions` (tests use the non-socket path).
- E2B/Exa/AgentMail integrations — never called by these scenarios.
- `opencode-src/` — vendored, always out of scope.

## Git workflow

- Branch: `advisor/012-e2e-harness`
- Conventional commits, e.g. `test: add offline e2e harness with fake slack and scripted provider`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Production seams

1. `apps/bot/src/env.ts` — in the `server` block, after
   `SLACK_SOCKET_MODE`, add:

```ts
SLACK_API_URL: z.url().optional(),
```

2. `apps/bot/src/slack/app.ts` — in **both** `new App({...})` calls, add:

```ts
...(env.SLACK_API_URL
  ? { clientOptions: { slackApiUrl: env.SLACK_API_URL } }
  : {}),
```

   (Bolt forwards `clientOptions` to every `WebClient` it constructs,
   including `app.client`.)

3. `packages/ai/src/keys.ts` — alongside `OPENROUTER_BASE_URL`, add
   `HACKCLUB_BASE_URL: z.url().optional()` to both the schema and
   `runtimeEnv`.

4. `packages/ai/src/providers.ts` — change the hardcoded baseURL:

```ts
const hackclubBase = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: env.HACKCLUB_BASE_URL ?? 'https://ai.hackclub.com/proxy/v1',
});
```

**Verify**: `bun typecheck` → exit 0. Behavior is unchanged when the new
vars are unset.

### Step 2: Harness env (`apps/bot/test/e2e/harness/env.ts`)

A module whose only job is to set `process.env` **before any app module is
imported**. Export a function, not side effects at import order the executor
can't control — `harness/index.ts` (step 5) calls it first.

```ts
export function applyTestEnv({
  providerUrl,
  slackUrl,
}: {
  providerUrl: string;
  slackUrl: string;
}) {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    SLACK_BOT_TOKEN: 'xoxb-test-token',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    SLACK_API_URL: slackUrl,
    HACKCLUB_API_KEY: 'sk-hc-test',
    HACKCLUB_BASE_URL: `${providerUrl}/hackclub`,
    OPENROUTER_API_KEY: 'sk-test',
    OPENROUTER_BASE_URL: `${providerUrl}/openrouter`,
    EXA_API_KEY: 'test-exa-key',
    E2B_API_KEY: 'test-e2b-key',
    AGENTMAIL_API_KEY: 'am_test_key',
    SERVER_BASE_URL: 'http://127.0.0.1:1',
    MCP_ENCRYPTION_KEY: 'e2e-test-encryption-key-0123456789ab',
    DATABASE_URL:
      process.env.E2E_DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5433/gorkie_e2e',
  };
  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] = value;
  }
  delete process.env.SLACK_SOCKET_MODE;
  delete process.env.SLACK_APP_TOKEN;
  delete process.env.OPT_IN_CHANNEL;
  delete process.env.AUTO_ADD_CHANNEL;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.LANGFUSE_BASEURL;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
}
```

Every value is overwritten (not defaulted) so a developer's real
`apps/bot/.env` can never leak live credentials into a test run — except
`E2E_DATABASE_URL`, the one deliberate input.

### Step 3: Fake Slack Web API (`harness/fake-slack.ts`)

`Bun.serve({ port: 0, ... })`. The Slack `WebClient` POSTs
`https://<base>/<method>` with either `application/json` or
`application/x-www-form-urlencoded` bodies (form fields holding nested
structures are JSON-stringified strings). Implement one body parser handling
both; for form bodies, attempt `JSON.parse` per value and fall back to the
raw string.

Interface:

```ts
export interface RecordedCall {
  method: string; // e.g. 'chat.postMessage'
  body: Record<string, unknown>;
}

export interface FakeSlack {
  url: string; // MUST end with '/'; WebClient appends method names
  calls: RecordedCall[];
  callsTo(method: string): RecordedCall[];
  setThreadReplies(messages: unknown[]): void;
  reset(): void;
  stop(): void;
}
```

Canned responses by method (everything else returns `{ ok: true }` and is
still recorded, so unexpected calls are visible in assertions):

| Method | Response |
|--------|----------|
| `auth.test` | `{ ok: true, url: 'https://test.slack.com/', team: 'Test', team_id: 'TTEST', user: 'gorkie', user_id: 'U0BOT', bot_id: 'B0BOT' }` |
| `chat.startStream` | `{ ok: true, ts: '<next ts>', channel: <from body> }` |
| `chat.appendStream`, `chat.stopStream`, `reactions.add`, `assistant.threads.setStatus`, `chat.update` | `{ ok: true }` |
| `chat.postMessage` | `{ ok: true, ts: '<next ts>', channel: <from body> }` |
| `conversations.replies` | `{ ok: true, messages: <setThreadReplies value, default []>, has_more: false }` |
| `conversations.history` | `{ ok: true, messages: [], has_more: false }` |
| `conversations.info` | `{ ok: true, channel: { id: <from body>, name: 'general', is_channel: true, is_im: false } }` |
| `users.info` | `{ ok: true, user: { id: <from body>, name: 'testuser', real_name: 'Test User', is_bot: <true when id === 'U0BOT'>, profile: { display_name: 'testuser', real_name: 'Test User' } } }` |

`<next ts>` = an incrementing counter formatted like `'1700000100.000001'`.

### Step 4: Fake model provider (`harness/fake-provider.ts`)

`Bun.serve({ port: 0 })` answering
`POST /hackclub/chat/completions` and `POST /openrouter/chat/completions`
(the path prefix tells you which provider the retry chain reached — no
header sniffing needed).

Scripted-turn interface:

```ts
export type ScriptedTurn =
  | {
      toolCalls: { name: string; args: Record<string, unknown> }[];
      text?: string;
    }
  | { error: { status: number; message?: string } };

export interface RecordedModelRequest {
  provider: 'hackclub' | 'openrouter';
  model: string;
  body: Record<string, unknown>; // full parsed request
}

export interface FakeProvider {
  url: string;
  requests: RecordedModelRequest[];
  script(turns: ScriptedTurn[]): void; // queue; each request consumes one
  reset(): void;
  stop(): void;
}
```

Behavior per request: record it; shift the next turn off the queue (if the
queue is empty, respond 500 with a distinctive message — a scenario bug, not
a silent hang). For an `error` turn, respond with that HTTP status and body
`{ "error": { "message": ... } }`. Otherwise stream OpenAI-style SSE
chunks (`Content-Type: text/event-stream`), each as
`data: <json>\n\n`:

1. Role chunk:
   `{"id":"cmpl-<n>","object":"chat.completion.chunk","created":1700000000,"model":"<model from request>","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`
2. Optional text chunk (when `turn.text`): same envelope,
   `delta: {"content": "<text>"}`.
3. One chunk per tool call (index `i`):
   `delta: {"tool_calls":[{"index":i,"id":"call_<n>_<i>","type":"function","function":{"name":"<name>","arguments":"<JSON.stringify(args)>"}}]}`
4. Finish chunk:
   `choices:[{"index":0,"delta":{},"finish_reason":"tool_calls"}]` plus
   `"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}`.
5. `data: [DONE]\n\n`, then close.

(When a turn has no tool calls, use `finish_reason: "stop"` — but note the
orchestrator runs with `toolChoice: 'required'`, so every scripted turn in
practice ends in a tool call.)

### Step 5: Harness singleton (`harness/index.ts`)

Boot order matters: start both fakes → `applyTestEnv` → **dynamic** import of
`@/slack/app` (env modules validate at import). Use a module-level promise so
all test files share one app:

```ts
import { applyTestEnv } from './env';
import { createFakeProvider, type FakeProvider } from './fake-provider';
import { createFakeSlack, type FakeSlack } from './fake-slack';

export interface Harness {
  app: import('@slack/bolt').App;
  slack: FakeSlack;
  provider: FakeProvider;
  sendMessage(event: Record<string, unknown>): Promise<void>;
  reset(): void;
}

let harness: Promise<Harness> | null = null;

export function getHarness(): Promise<Harness> {
  harness ??= boot();
  return harness;
}

async function boot(): Promise<Harness> {
  const slack = createFakeSlack();
  const provider = createFakeProvider();
  applyTestEnv({ providerUrl: provider.url, slackUrl: slack.url });
  const { createSlackApp } = await import('@/slack/app');
  const { app } = createSlackApp();

  let eventSeq = 0;
  const sendMessage = async (event: Record<string, unknown>) => {
    eventSeq += 1;
    await app.processEvent({
      ack: () => Promise.resolve(),
      body: {
        token: 'test-token',
        team_id: 'TTEST',
        api_app_id: 'A0TEST',
        type: 'event_callback',
        event_id: `Ev${eventSeq}`,
        event_time: 1_700_000_000 + eventSeq,
        event,
      },
      retryNum: undefined,
      retryReason: undefined,
    });
  };

  return {
    app,
    slack,
    provider,
    sendMessage,
    reset: () => {
      slack.reset();
      provider.reset();
    },
  };
}
```

Also export a message-event builder so scenario payloads stay consistent:

```ts
let ts = 1_700_000_000;
export function dmEvent({ text }: { text: string }) {
  ts += 10;
  return {
    type: 'message',
    channel: 'D0TEST',
    channel_type: 'im',
    user: 'U0HUMAN',
    text,
    ts: `${ts}.000100`,
    event_ts: `${ts}.000100`,
  };
}
export function mentionEvent({ text }: { text: string }) {
  ts += 10;
  return {
    type: 'message',
    channel: 'C0TEST',
    channel_type: 'channel',
    user: 'U0HUMAN',
    text: `<@U0BOT> ${text}`,
    ts: `${ts}.000100`,
    event_ts: `${ts}.000100`,
  };
}
```

Note the `@/` path alias resolves via `apps/bot/tsconfig.json` paths — Bun
honors it as long as tests run from inside `apps/bot`. If the alias maps only
`src/` (check `apps/bot/tsconfig.json` before assuming), import the harness's
own files by relative path and only app modules via `@/`.

### Step 6: Wiring (scripts, turbo, CI)

1. `apps/bot/package.json`:
   - If a `test` script exists (plan 001 ran): change it to
     `"test": "bun test src"` so unit runs exclude e2e.
   - If not: add `"test": "bun test src"` anyway (harmless before 001; it
     reports no tests found — do not wire it into turbo in that case).
   - Add `"test:e2e": "bun test test/e2e"`.
2. Root `package.json`: add `"test:e2e": "turbo run test:e2e"`.
3. `turbo.json`: add

```json
"test:e2e": {
  "cache": false,
  "passThroughEnv": ["E2E_DATABASE_URL"]
}
```

4. `.github/workflows/ci.yml`: add a job modeled on the existing ones:

```yaml
  e2e:
    name: E2E
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: gorkie_e2e
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - name: Checkout branch
        uses: actions/checkout@v4

      - name: Setup
        uses: ./tooling/github/setup

      - name: Push schema
        run: bun run db:push
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5433/gorkie_e2e

      - name: Run e2e tests
        run: bun run test:e2e
        env:
          E2E_DATABASE_URL: postgres://postgres:postgres@localhost:5433/gorkie_e2e
```

5. `DEVELOPMENT.md`: add a short section — start the docker Postgres (the
   exact command from "Commands you will need"), `db:push`, then
   `bun run test:e2e`.

### Step 7: Scenario tests — `core-flow.test.ts`

Shared setup: `const h = await getHarness();` at module level (top-level
await is fine in Bun tests); `beforeEach(() => h.reset())`.

**Scenario 1 — DM → reply.** Script one turn:
`{ toolCalls: [{ name: 'reply', args: { content: ['Hello from Gorkie!'], type: 'reply' } }] }`.
`await h.sendMessage(dmEvent({ text: 'hi' }))`. Assert:

- exactly one `chat.postMessage` recorded, with
  `markdown_text === 'Hello from Gorkie!'`, `channel === 'D0TEST'`;
- `chat.startStream` and `chat.stopStream` each called once;
- at least one `chat.appendStream` whose chunks include a task titled
  `'Thinking…'` (the per-step plan UI — this is the "agentic workflow
  visibility" assertion);
- exactly one provider request; its `body.messages` includes a system role
  and the user text; `body.tools` includes entries named `reply`, `react`,
  `searchWeb` (toolset exposure check);
- the final `assistant.threads.setStatus` call has `status: ''`.

**Scenario 2 — mention → react then reply (two agent steps).** Script two
turns: turn 1 `react` (args per the `react` tool's input schema — read
`apps/bot/src/lib/ai/tools/chat/react.ts` first and use its exact field
names), turn 2 `reply` with `content: ['Done!']`.
`await h.sendMessage(mentionEvent({ text: 'please react' }))`. Assert:

- `reactions.add` recorded once, then one `chat.postMessage` (order: find
  indexes in `h.slack.calls`);
- exactly two provider requests; the second request's `body.messages`
  contains a `tool` role message carrying the `react` result (presence is
  enough; don't over-specify the serialized shape);
- the loop stopped after `reply` (no third provider request).

**Scenario 3 — skip → silence.** Script one turn calling `skip` (read
`skip.ts` for its args; likely a reason string).
Send a DM. Assert: zero `chat.postMessage` calls; stream still opened and
closed.

**Verify**: `cd apps/bot && bun test test/e2e/core-flow` → all pass, against
the dockerized Postgres from "Commands you will need".

### Step 8: Scenario test — `provider-fallback.test.ts` (chaos)

Script: `{ error: { status: 500, message: 'boom' } }` repeated enough times
to exhaust every attempt the retry layer makes against the primary model,
followed by one good `reply` turn. Because `ai-retry`'s exact attempt count
against the primary is an implementation detail, make the fake stateful for
this test instead of using the queue: respond 500 to every request whose
`model === 'google/gemini-3-flash-preview'` on the `hackclub` path, and
succeed (scripted `reply` turn) for `model === 'openai/gpt-5.4-mini'` on the
`hackclub` path. (Add a `scriptByMatcher` option to the fake if the queue
API can't express this — keep it minimal.)

Send a DM. Assert:

- a `chat.postMessage` still happened (user-visible recovery);
- `h.provider.requests` contains ≥1 request for the gemini model before the
  first `gpt-5.4-mini` request (fallback order);
- no request ever reached the `openrouter` path (chain stopped at the second
  link).

This test directly characterizes the GOAL.md "Retry Logic [big]" concern and
becomes the regression net for any future provider-chain rework.

**Verify**: `cd apps/bot && bun test test/e2e` → all pass. Then run the full
gate: `bun x ultracite fix .`, `bun check`, `bun typecheck`,
`bun run check:spelling`, and (if plan 001 ran) `bun run test`.

## Test plan

This plan is itself the test plan: 2 e2e test files, 4 scenarios, plus the
harness. The harness modules need no tests of their own — the scenarios
exercise them end to end.

## Done criteria

- [ ] `cd apps/bot && bun test test/e2e` → 4+ tests pass against a local
      Postgres, with **no outbound network traffic** (verify: tests pass with
      Wi-Fi off, or by checking no request logs mention slack.com /
      ai.hackclub.com / openrouter.ai)
- [ ] `bun typecheck`, `bun check`, `bun run check:spelling` → exit 0
- [ ] Production diffs limited to the four seam files + wiring files; each
      seam is a no-op when its env var is unset (read the diff to confirm)
- [ ] CI has an `e2e` job with a Postgres service
- [ ] `plans/README.md` status row updated

## STOP conditions

- `app.processEvent` does not exist or rejects the envelope shape on the
  installed `@slack/bolt` version — check
  `node_modules/@slack/bolt/dist/App.d.ts` for the `processEvent` signature
  and `ReceiverEvent` type; adapt field names if they differ, but STOP if the
  method is absent.
- Bolt rejects `clientOptions.slackApiUrl` or the WebClient still calls
  slack.com — STOP and report; do not monkey-patch `fetch`/`axios`.
- The AI SDK OpenRouter provider rejects the fake's SSE (e.g. errors about
  missing fields): fix the chunk format per the error, but STOP if it
  requires non-OpenAI-shaped responses (then the fallback design is an
  in-process `MockLanguageModel` injected via a new test-only branch in
  `packages/ai/src/providers.ts` — report first, don't build it
  unilaterally).
- `await h.sendMessage(...)` returns before the agent finishes (assertions
  see no calls): Bolt may not await listeners in this version. Add a
  `waitFor(() => h.slack.callsTo('chat.stopStream').length > 0)` polling
  helper (50ms interval, 10s timeout) rather than sleeps; STOP if even that
  never settles.
- Any test attempts a real network call (you see DNS errors for slack.com or
  provider hosts) — an env var leaked; fix `applyTestEnv`, do not add the
  missing host to CI.

## Maintenance notes

- **Plan 013 builds directly on this harness** (adds an MCP fixture server +
  approval-flow scenarios). Keep `FakeSlack`/`FakeProvider` interfaces
  stable.
- Plans 003, 005, and 011 change approval/MCP/permission code — run this
  plan **before** them so their executors inherit a safety net; their
  reviewers should run `bun run test:e2e`.
- The fake provider encodes today's model IDs (`google/gemini-3-flash-preview`,
  `openai/gpt-5.4-mini`). Changing the chain in `providers.ts` (a stated
  TODO in GOAL.md) will break `provider-fallback.test.ts` expectations —
  that's the test doing its job; update the model IDs there in the same PR.
- Slack's streaming methods (`chat.startStream` etc.) are new API surface;
  if `@slack/web-api` renames them, `stream.ts` and the fake must change
  together.
- Reviewers: watch for scenarios asserting on exact prompt text — system
  prompts change often; assert on structure (roles, tool names), not prose.
