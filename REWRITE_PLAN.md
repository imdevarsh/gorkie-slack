# Gorkie v2 — Rewrite Plan

> Status: planning. Branch `feat/rewrite-from-scratch` (reset onto `feat/ai-sdk-harness`).
> Last updated: 2026-06-14.
>
> ### 📂 Original codebase (read-only reference)
> **`/workspaces/worktrees/gorkie-slack/reference`** — branch `feat/ai-sdk-harness`,
> commit `d7ce686`. This is the full v1 implementation: old DB schemas (MCP, scheduled
> tasks), the MCP layer, sandbox/e2b logic, Slack/Bolt code, prompts — everything we
> deleted here lives there. **Read it to understand *how* a hard piece was solved, then
> re-derive cleanly. Never copy/paste it into v2.** (`cd ../reference` from `apps/bot`.)

## 1. Goal

Rewrite gorkie into a cleaner, more abstracted, multi-surface-capable AI agent where
**the agent runs by default inside a harness** (AI SDK 7 `HarnessAgent` + `pi`), with a
sandbox per conversation [thread]. Fix the v1 pains — *the agent forgot what tools it called* and
*had no compaction* — by making the harness (which owns native history + compaction) the
brain, not a side tool. BYOK-first, strict per-user secret isolation, ability to diversify
to other platforms (Discord, etc.).

**No backward/data compatibility required** — v1 has no data we must preserve; design the
schema fresh.

**Two-part build:**
- **Part 1 — Core layer (build first):** gorkie converses **thread-only**; one
  `HarnessAgent(pi)` per thread on a **single shared service key** (no per-user keys yet);
  persistence + steering + the core Slack conversation tools. That's the whole focus.
- **Part 2 — later, do not let it block Part 1:** **BYOK** (per-user keys), **MCP** (+ its
  `apps/server` OAuth callback + low-level Bolt UI), and **Scheduled Tasks**. Per-user secret
  isolation belongs here too, since it only matters once BYOK/MCP exist.

Trying to make everything work at once is the failure we're avoiding.

## 2. Reference branch — proof of feasibility, NOT code to copy

This is a **true rewrite with fresh, clean architecture** — we do **not** reclutter the old
codebase into a new framework. The `feat/ai-sdk-harness` branch is checked out **read-only**
as a `reference` worktree at `/workspaces/worktrees/gorkie-slack/reference` (commit `d7ce686`).
Use it to *understand how a hard piece was solved*, then re-derive it cleanly — do **not**
follow old logic unless strictly necessary. The reference proves the risky parts work:

- **A working custom e2b harness sandbox provider** — `E2BSandboxProvider implements HarnessV1SandboxProvider` (`apps/bot/src/lib/sandbox/providers/e2b/`). The biggest unknown ("can the harness even use e2b?") is **solved**.
- **Harness session resume** — `session.detach()/stop()` → `resumeState` JSON → `sandboxSessions.resumeState` → `createSession({ resumeFrom })`. Survives restarts.
- **Full per-user MCP layer** (`apps/bot/src/lib/mcp/`) — encrypted bearer + OAuth (PKCE + refresh), SSRF-guarded fetch, per-user isolation by `userId`, tool modes (allow/ask/block), and an approval flow that pauses → posts Slack buttons → resumes with a `tool-approval-response`.
- **MCP App Home UI** (`apps/bot/src/slack/features/customizations/mcp/`) — Bolt modals for connecting/configuring servers.
- **AI SDK 7 + a vendored `ai-retry` patch** for the v7 spec.

(All paths above now exist **only** in the `reference` worktree — `apps/bot` and
`packages/ai` have been gutted on this branch.)

**Mandate: innovate, don't transcribe.** The reference shows that the hard pieces are
*possible*; it does not dictate *how* v2 does them. Reach for clean abstractions and good
libraries first, and design the v2 shape fresh. Only fall back to reference logic when a
detail is genuinely load-bearing (e.g. an e2b API quirk). Re-pasting the old structure into
the new framework is explicitly a failure mode to avoid.

## 3. Locked decisions

| Area | Decision |
|---|---|
| Agent core | **`HarnessAgent` + `pi` is the brain**, one per thread. Pure harness, **no abstraction seam**. |
| Build approach | **True rewrite, fresh architecture.** Reference is read-only inspiration; innovate and use good abstractions/libraries rather than transcribing old logic. |
| Platform layer | **Adopt `vercel/chat`** (`chat` + `@chat-adapter/slack`), **Slack socket mode for now**, `WebClient` escape hatch for App Home/custom surfaces. |
| Sandbox | **Stay on e2b** (only provider with warm FS+memory resume + indefinite pause; adapter already written). |
| Multi-user threads | The **replying user** runs the turn with **their own** keys/MCP. Never expose one user's BYOK secrets/OAuth MCP to another. |
| BYOK | **Part 2.** Per-user model keys → `createPi({ auth: { customEnv } })` per session. Part 1 uses one shared service key. |
| Persistence | **DB is primary; sandbox is disposable.** Postgres `resumeState` (harness-owned conversation history) is the source of truth. The e2b sandbox is a throwaway file cache — the janitor may kill it freely; if it's gone next turn, spin a **fresh** sandbox and resume the conversation from `resumeState` (workspace files are lost — acceptable). Resume path must fall back to create-fresh on connect-by-id failure, never error. |
| Tooling | Keep turborepo, ultracite/biome, cspell, knip, lefthook, bun catalog, drizzle. |
| Reference | `feat/ai-sdk-harness` lives read-only at `../reference`. Understand, don't copy. |
| Deferred | **MCP** and **`apps/server`** come *after* gorkie works end-to-end (they need low-level Bolt/OAuth code). Build the core agent first. |

## 3a. Repo layout & cleanup

**Done (bare-bones gutting):** deleted `apps/server`, `packages/kv`, `plans/`, `docs/`,
`comments.md`, **all of `apps/bot/src`**, **`packages/ai`**, the `ai-retry` patch, and
`apps/bot/.env.example`. Removed `server`/`build:sandbox` scripts, `nitro`/`srvx`/`ai-retry`
from the catalog, and the `patchedDependencies` block. `apps/bot` is now a stub
(`src/index.ts` + minimal `package.json`). Also trimmed `packages/db` to the core schema
(`sandbox_sessions` + `customizations`; removed MCP + scheduled-task schema/queries) and
`packages/utils` to generic helpers (`error`/`text`/`time`; removed `guarded-fetch`,
`secret`, `mcp`, `mcp-oauth-state`, `record`). The monorepo intentionally does **not**
typecheck/build yet — that's expected. All removed code (incl. old schemas) lives in the
`reference` worktree and is re-derived when Part 2 lands.

**Target package layout (fresh):**

| Package | Purpose |
|---|---|
| `apps/bot` | Runtime: `vercel/chat` Slack adapter + wiring. Gutted to a skeleton, rebuilt. |
| `packages/config` | **New.** Centralized static config + env validation (replaces scattered `apps/bot/src/{config,env}.ts`). Fixes the "config is cluttered" problem. |
| `packages/agent` | **New.** The HarnessAgent(pi) core: `createPi`, system-prompt assembly, host-tool registry, streaming. **Replaces `packages/ai`** (which gets removed once ported). |
| `packages/sandbox` | **New.** e2b `HarnessV1SandboxProvider` + session lifecycle (re-derived from reference). |
| `packages/db` | Keep — drizzle. |
| `packages/validators` | Keep — zod schemas. |
| `packages/utils` | Keep (trim). |
| `packages/logging` | Keep — pino. |

**AI deps:** `ai-retry` + patch already removed (can't wrap a harness; pi owns model
routing). Keep only the provider deps host tools actually need (e.g. image generation),
added when those tools land. `apps/server` (MCP OAuth callback) returns only in the MCP phase.

## 4. Target architecture

```
Slack / (later Discord) ──▶ vercel/chat adapter ──▶ Runtime (apps/bot)
                                                       │
   per request, build a per-user HarnessAgent(pi):     │   pi runs ON HOST
     · createPi({ auth.customEnv: <user's keys> })      │   (keys + MCP never
     · tools = Slack affordances + user's MCP tools      │    enter the sandbox)
     · sandbox = e2bProvider                            │
                                                       │
   pi built-in tools (bash/read/write/edit/grep/glob) ──▶ e2b sandbox (FS/shell)
   pi assistant text ──stream──▶ thread.post(stream) ──▶ Slack
                                                       │
   on finish: session.detach()/stop() ──▶ Postgres (resumeState) + message mirror
```

- **One `HarnessAgent(pi)` per thread.** pi's native history + compaction + approval are the
  point — they directly fix the v1 pains at the conversation level.
- **pi runs on the host.** The sandbox is only a remote FS/shell for pi's coding tools. This
  is what makes per-user BYOK + MCP safe: secrets live in the host agent instance for that
  turn, never in the sandbox.
- **Slack affordances become host-executed AI SDK tools** on the HarnessAgent
  (`react`, `searchWeb`, `searchSlack`, `getWeather`, `getUserInfo`, `generateImage`,
  `mermaid`, `scheduleTask`/reminder/list/cancel, `leaveChannel`, `summariseThread`, file
  upload). **`reply` and `skip` are dropped** — pi's streamed assistant text *is* the
  message; "no response needed" is just an empty/short turn, not a tool.
- **Steering is a built-in default.** pi supports mid-turn steering, so a follow-up message
  that arrives while a turn is in flight is fed into the **live** session to redirect it
  (rather than queued or dropped). Wire this in Phase 2 via the harness steering /
  `suspendTurn`+continue API (confirm exact surface against `@ai-sdk/harness-pi`).
- **MCP tools** are injected as additional host tools, per replying user.

### Per-turn lifecycle
1. `vercel/chat` Slack adapter receives event (`onNewMention`, DM, etc.).
2. Resolve thread → load `resumeState` from Postgres for this thread.
3. Build a **per-user** `HarnessAgent(pi)`: the replying user's model keys (`customEnv`) +
   their MCP toolset + Slack tools + `e2bProvider`.
4. `agent.createSession({ sessionId: threadId, resumeFrom })`.
5. `agent.stream({ session, prompt: latestMessage })`; pipe `result.stream` text into
   `thread.post(stream)` (Chat SDK handles `chat.update` throttling).
6. On finish: `session.detach()` (dev) / `stop()` (prod pause) → persist `resumeState` +
   mirror messages/tool-calls to Postgres.

## 4a. Core mechanics — how the harness brain actually works

### Sessions & `resumeState`
A `HarnessAgent` is stateless; a **session** holds state. The session owns pi's native
history (every user/assistant message **and every tool call + result** pi made), compaction
state, pending tool approvals, and the link to its sandbox. That is serializable into one
opaque blob: **`resumeState`** (`HarnessAgentResumeSessionState`).

Per turn = read-modify-write, keyed by `threadId`:
1. Load `resumeState` JSON from Postgres (`sandboxSessions.resumeState`).
2. `agent.createSession({ sessionId: threadId, resumeFrom: resumeState })` → harness rebuilds
   pi's in-memory session from the blob. **No replay of Slack history** — pi already remembers.
3. `agent.stream({ session, prompt: <new user message> })` → pi runs, appending new messages +
   tool calls/results into the session.
4. `session.detach()` / `stop()` → returns the **updated** `resumeState`; write it back to PG.

This loop *is* the v1 fix: tool calls/results live in `resumeState`, restored every turn;
compaction is the harness summarizing old history inside that same blob, automatically.

### detach vs stop vs destroy
- `detach()` — parks runtime, **keeps the sandbox warm**, returns resume state. (active/dev)
- `stop()` — saves resume state, **pauses the sandbox** (→ e2b `betaPause`). (idle/prod)
- `destroy()` — tears down, **discards** resumability.

### What `resumeState` does NOT contain
Workspace **files** — those live in the e2b sandbox, not the blob.

### DB-primary, sandbox-disposable
`resumeState` in Postgres is the source of truth; the sandbox is a throwaway file cache.
- Janitor kills idle sandboxes → only files are lost, never conversation.
- Next turn: if `Sandbox.connect(oldId)` fails (killed/expired), **create a fresh sandbox** and
  still `resumeFrom` the DB blob. pi keeps full memory; the new sandbox is empty. Files lost =
  acceptable. Resume must fall back to create-fresh, never error.
- ⚠️ **Phase 3 verify:** confirm the harness accepts `resumeFrom` against a *new* sandbox
  (the reference reconnects to the same `sandboxId`). If the blob hard-pins a sandbox id,
  strip/rewrite it on resume.

### `onSandboxSession` (idempotent setup)
Runs on **fresh and resumed** sessions — (re)write pi's `SYSTEM.md`, make working dirs,
re-sync attachments. Must be safe to run every turn.

### Streaming to Slack
`agent.stream()` returns an AI-SDK-shaped result. Consume `result.stream` server-side:
`text-delta` → accumulate into the Slack message; `tool-call`/`tool-result` → optional status
blocks; `error` → throw. `vercel/chat`'s `thread.post(stream)` handles `chat.update`
throttling. No `reply`/`skip` tool — pi's streamed text *is* the message.

### Steering
A follow-up message arriving mid-turn is injected into the **live** session to redirect pi,
not queued. Wire via the harness steering / `suspendTurn`+continue surface (confirm exact API
against `@ai-sdk/harness-pi` in Phase 2.5).

## 5. Chat SDK — verdict (verified by cloning `vercel/chat`)

`@chat-adapter/slack` does **not** box us in:
- `callSlackApi(method, body, opts)` — generic caller for *any* Web API method (incl. `views.publish`).
- `adapter.webClient` / `adapter.client` — direct raw `@slack/web-api` `WebClient`, per-token cached (`src/index.ts:455–569`).
- Socket mode supported (`SocketModeClient`, `startSocketMode()`).
- App Home is first-class: `app_home_opened` event + `AppHomeOpenedHandler`; home-tab actions routed.

→ **Adopt it.** Full low-level Slack access is preserved, and we get the multi-platform seam
for free. Because we're rewriting the Slack layer anyway, there is no Bolt-migration cost.
Use `@chat-adapter/state-pg` (or `state-redis`) for subscriptions/locks/dedup; let the
harness own conversation history (don't double-store via `bot.transcripts`).

## 6. Security model
- **pi on host** ⇒ model keys + MCP creds never enter the sandbox.
- **Per-user agent instances** ⇒ never a shared client holding creds; construct per request,
  closed over the replying user's secrets.
- **MCP creds** encrypted at rest (see §9 about the single-key concern).
- **e2b reconnect-by-id must be owner-scoped** — a sandbox id is only resumable by its owning
  thread/user (DB-scoped), never reachable cross-tenant.
- **OAuth callback** needs a public redirect URI ⇒ `apps/server` is re-introduced in the MCP
  phase for exactly this (deferred until the core agent works).

## 7. Concerns & risks (consequences of "orchestrator = pi, no seam")

1. **Every thread boots an e2b sandbox**, even for "what's the weather." Accepted tradeoff:
   autoPause → idle threads cost storage only; warm resume ~1s. But it is real cost + latency
   and many sandbox lifecycles to manage. (Mitigation idea to evaluate: lazily create the
   sandbox only when a coding tool is first used — needs to confirm the harness allows it.)
2. **pi is a coding agent used as a conversational brain.** The system prompt must drive
   conversation, not just coding; the unified prompt is new work. Confirm how a turn ends and
   how incremental assistant text streams to Slack cleanly.
3. **Shared-thread MCP data leak (RESOLVED → D1).** Tool *definitions* are loaded per
   replying user, so there is no cross-user exposure of *which* MCP tools/servers a user has.
   The only residual is that tool *results* fetched with user A's creds land in the
   per-thread `resumeState` history, which user B could see on resume. Resolution: MCP in
   shared/public threads is **opt-in per user** ("allow my MCP in public threads"); default
   is DMs / single-user threads only. Surface the result-in-history caveat at opt-in time.
4. **Canary coupling (low concern).** The brain depends on `@ai-sdk/harness@canary` +
   `@ai-sdk/harness-pi@canary`. Judged stable enough to build on directly (no seam).
   Light mitigation only: pin exact canary versions and keep one full-turn smoke test green
   when bumping. (`ai-retry` is removed — it can't wrap the harness; pi owns model routing.)
5. **BYOK is currently stubbed** — `createPi` hardcodes `OPENROUTER_API_KEY: env.HACKCLUB_API_KEY`.
   Real per-user keys must flow into `customEnv` per session.
6. **Compaction over long, multi-day Slack threads** is unverified for a coding harness — test it.

## 8. MCP — LATER STAGE, do not worry about it now

MCP is the biggest source of complexity and the main multi-tenant risk surface (per-user
encrypted creds, OAuth, approval, shared-thread leakage) — and it needs the low-level Bolt/
`apps/server` code we deliberately deferred. **It is explicitly out of v1-critical scope.**
Build the thread agent first; MCP is a *later* phase and must not gate or complicate the
core. When it does land it will be re-derived cleanly (not copied) and gated per §9 D1.

## 9. Design decisions

**Resolved**
- **D1 — Shared-thread MCP isolation. ✅** Tool definitions are per-replying-user (no
  cross-user tool exposure). MCP in shared/public threads is **opt-in per user**, default
  DMs / single-user only. Warn about result-in-history at opt-in time.
- **D2 — Build order. ✅** Build **ground-up, simplest → complex, in tracked steps**. MCP is
  a later step, not launch.
- **D4 — Reply/skip. ✅** Drop **both** `reply` and `skip`; pi's streamed text is the message.

**Still open**
- **D3 — Sandbox eagerness.** Boot e2b on every thread, or lazily on first coding-tool use?
  Needs a harness capability check.
- **D5 — `apps/server` fate. ✅ (deferred-decided)** Deleted now; re-introduced in the MCP
  phase as the MCP OAuth callback host (+ webhook receiver if not socket-mode).
- **D6 — Single MCP encryption key.** v1 uses one server-wide `MCP_ENCRYPTION_KEY`. Move to
  envelope / per-user key derivation?
- **D7 — Provider fallback under pi.** pi owns model routing; does `ai-retry`-style fallback
  still apply, or do we rely on AI Gateway / pi's own routing?

## 10. Build plan

Each phase: design fresh (reference for understanding only) → build clean → vet
(types, ultracite, a full-turn smoke test) → mark done.

### Part 1 — Core layer (single shared key, thread-only)
- **Phase 0 — Skeleton.** Gut `apps/bot` (done); keep `tooling/*` + `packages/{db,validators,utils,logging}`;
  scaffold `packages/{config,agent,sandbox}`; pin `@ai-sdk/harness*@canary`, AI SDK 7,
  `chat` + `@chat-adapter/slack`; `bun install`. Wire env + logging.
- **Phase 1 — Platform layer.** `vercel/chat` Slack adapter (socket mode), event routing,
  streaming sink to `thread.post`. Hello-world reply, no agent.
- **Phase 2 — Harness brain.** `HarnessAgent(pi)` per thread (shared key); unified system
  prompt; e2b provider (re-derived); stream pi text → Slack (no `reply`/`skip` tools).
- **Phase 2.5 — Steering.** Feed mid-turn follow-up messages into the live session to redirect
  it; confirm the harness steering / `suspendTurn`+continue surface.
- **Phase 3 — Persistence (DB-primary).** `resumeState` + message-mirror tables (drizzle);
  sandbox is disposable — resume conversation into a fresh sandbox when the old one is gone;
  verify history + compaction survive restart, sandbox death, and long threads.
- **Phase 4 — Core conversation tools.** Host tools: `react`, `searchWeb`/`searchSlack`,
  `getWeather`, `getUserInfo`, `generateImage`, `mermaid`, `summariseThread`, file upload.

### Part 2 — later (must not block Part 1)
- **Phase 5 — BYOK.** Per-user keys → `customEnv`; per-user agent instances closed over the
  replying user's secrets; key storage. Introduces per-user secret isolation.
- **Phase 6 — MCP (per D1).** Re-derive MCP (encrypted creds, OAuth, approval) + bring back
  `apps/server` for the OAuth callback; gate to DMs / single-user threads first.
- **Phase 7 — App Home & MCP UI.** Build on Chat SDK + `WebClient.views.publish`.
- **Phase 8 — Scheduled tasks** + janitor tuning.
- **Phase 9 — Diversification proof.** Add a Discord adapter to validate the seam.

## 11. Stack / tooling changes
- On **AI SDK 7 canary** (`@ai-sdk/harness*`, `@ai-sdk/harness-pi`, and `@ai-sdk/mcp` in Part 2).
- **Bolt removed**, replaced by `vercel/chat` + `@chat-adapter/slack` (socket mode).
- **`apps/server` deleted** — returns in Part 2 only as the MCP OAuth callback host.
- **`packages/kv` deleted.** If we need Chat SDK state (locks/dedup), use `@chat-adapter/state-pg`
  or `state-redis` directly.
- **`packages/ai` deleted** → reborn as `packages/agent`; new `packages/config`, `packages/sandbox`.
- `ai-retry` + patch removed (not v7/harness-compatible; revisit later for host-tool model calls).
- New drizzle tables (fresh, no back-compat): `sandboxSessions` (with `resumeState`) + a
  message mirror; MCP/scheduled tables arrive with Part 2.
- Keep: drizzle, cspell, knip, ultracite, lefthook, turbo.


## Coding Guidelines

### Inline over extract
Prefer inlining over creating utility functions. Only extract to a named function when the logic is called in **multiple places** or is genuinely complex. A helper called exactly once is worse than the code it replaced.

```ts
// bad — one-shot helper
function getFileExtension(mime: string) { return MAP[mime] ?? 'png'; }
const ext = getFileExtension(image.mediaType);

// good — just inline it
const ext = EXTENSION[image.mediaType] ?? 'png';
```

### Dict params
Functions with more than one parameter should take a single options object. Prefer this even for one-param functions when that parameter is logically a "config" rather than a plain value.

```ts
// bad
logReply(ctxId, author, result, reason);

// good
logReply({ ctxId, author, result, reason });
```

### No `as const` on type discriminants
When building objects that need a literal type for a discriminant field (e.g. `type: 'text'`), prefer assigning the whole expression to an SDK-typed variable or returning through a typed function. Do not use `as const` on the property.

```ts
// bad
{ type: 'text' as const, text }

// good — use the SDK's UserContent type as an annotation
const content: UserContent = [{ type: 'text', text }, ...images];
```

### Avoid type casting
Do not use type casts to silence TypeScript. Prefer schema parsing, typed builders, narrower function signatures, or explicit runtime checks. A cast is acceptable only at a real external boundary where TypeScript cannot know the shape after validation, and the validation should live next to the cast.

```ts
// bad
const meta = JSON.parse(view.private_metadata || '{}') as ServerMeta;

// good
const meta = serverMetaSchema.parse(JSON.parse(view.private_metadata || '{}'));
```

### No comments explaining what code does
Only add a comment when the **why** is non-obvious — a hidden constraint, a workaround for a specific bug, or behaviour that would genuinely surprise a reader. Never describe what the code already says.

### No JSDoc / docstrings
No multi-line block comments on functions. Self-documenting names are enough.

### Config for tuneable values
Anything that could reasonably change per deployment (thresholds, message lists, locale) belongs in `pkgs/config`

### Feature-enclosed architecture
Slack features live under `apps/bot/src/slack/features/<name>/`. Each feature exports `{ actions, views, commands }` from its `index.ts` when applicable. Keep feature-specific UI/actions near the feature that owns them.

### Code review
Use the `/coding-best-practices` skill when reviewing or auditing code for quality issues.

### Review cleanup findings
When addressing review comments, prefer deleting compatibility wrappers and one-shot helpers over renaming them. Keep MCP naming direct (`OAuth`, `URL`, concise function names), parse Slack modal metadata with schemas, and avoid adding files that only re-export another module without real ownership.

## Formatting and Linting (Ultracite)

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.


**When you don't know how something works — read the source, don't guess.** The harness/pi,
AI SDK 7, and `vercel/chat` are canary/under-documented. Clone and inspect:
`git clone --depth 1 https://github.com/vercel/ai /tmp/ai` ·
`git clone --depth 1 https://github.com/vercel/chat /tmp/chat` ·
`https://github.com/earendil-works/pi`.

**Use the skills** when the task touches their area: `ai-sdk`, `chat-sdk`, `slack-agent`,
`coding-best-practices`, `ultracite`, `neon-postgres`. They carry current patterns the model
shouldn't reinvent.
