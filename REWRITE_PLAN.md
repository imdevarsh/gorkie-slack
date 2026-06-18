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

## How to use this plan

**This plan is a map, not the full spec.** It captures the decisions, architecture, and build
order — the *details* live in the actual docs and source (see §13). When something is unclear,
**read the docs/source rather than guessing, and ask as many questions as you need.**

**Work step by step; clarity and quality >> one-shotting.** Don't rush into implementation —
get each step's design right, confirm it, then build. A correct, well-understood small step
beats a large speculative one. Before/while building, do a quick go-through of the relevant
prompts and references (Chat SDK + `chat/ai`, AI SDK harness, relevant GitHub issues).

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
| Sandbox | **Stay on e2b** for now (only provider with warm FS+memory resume + indefinite pause; adapter already written). Switch to the official AI SDK e2b provider once it ships and supports the same resume/session-file hooks we need. |
| Multi-user threads | The **replying user** runs the turn with **their own** keys/MCP. Never expose one user's BYOK secrets/OAuth MCP to another. |
| BYOK | **Part 2.** Per-user model keys → `createPi({ auth: { customEnv } })` per session. Part 1 uses one shared service key. |
| Persistence | **Sandbox-primary + a DB session-file mirror.** `resumeState` (a *pointer*) lives in Postgres; pi's transcript is a session file in the sandbox snapshot. To survive a sandbox kill, mirror that session file's bytes to Postgres each turn and re-seed it into a fresh sandbox on resume (Phase 3 — see §4a). Conversation durability must not depend on any single sandbox staying alive. |
| Tooling | Keep turborepo, ultracite/biome, cspell, knip, lefthook, bun catalog, drizzle. |
| Reference | `feat/ai-sdk-harness` lives read-only at `../reference`. Understand, don't copy. |
| Deferred | **MCP** and **`apps/server`** come *after* gorkie works end-to-end (they need low-level Bolt/OAuth code). Build the core agent first. |

This rewrite intentionally bets on AI SDK/Harness/pi maturing underneath us. Local provider
fallback, E2B sandbox wiring, steering patches, MCP glue, skills, plugin wiring, and Langfuse/OTel
tracing are bridge code, not permanent product architecture. Prefer upstream support as it lands:
- native MCP support and skill support;
- native steering support;
- a refactored pi provider implementation that is not ENV-prefix and model-id dependent;
- `ai-retry` support at the Harness/pi boundary so we can delete custom retry logic;
- native Langfuse / OTel support;
- official AI SDK e2b provider support;
- pi plugin support.

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
| `apps/bot` | Runtime: `vercel/chat` Slack wiring, env (`src/env.ts`), and bot-owned host tools under `src/lib/ai/tools/*` (`searchWeb`, `generateImage`, `uploadFile`, etc.). **No `packages/config`** — env lives here, monorepo like the previous version. |
| `packages/ai` | **Kept.** Platform-neutral agent core: `createPi`/`HarnessAgent` assembly, system prompts, provider setup, and AI env keys (`./keys`). No Slack/app-specific tools. |
| `packages/sandbox` | **New.** The e2b `HarnessV1SandboxProvider` + session lifecycle (incl. the DB session-file mirror). |
| `packages/db` | Keep — drizzle. |
| `packages/validators` | Keep — zod schemas. |
| `packages/utils` | Keep (trim). |
| `packages/logging` | Keep — pino. |

**AI deps:** the old `ai-retry` dependency/patch is removed, but the behavior is still needed.
Rebuild an ai-powered retry/fallback layer for Harness/pi model calls instead of trying to wrap
AI SDK `generateText` directly. Keep app-specific host-tool deps in `apps/bot`, not `packages/ai`.
`apps/server` (MCP OAuth callback) returns only in the MCP phase.

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
   on finish: session.detach()/stop() ──▶ Postgres (resumeState pointer + pi session-file bytes)
```

- **One `HarnessAgent(pi)` per thread.** pi's native history + compaction + approval are the
  point — they directly fix the v1 pains at the conversation level.
- **pi runs on the host.** The sandbox is only a remote FS/shell for pi's coding tools. This
  is what makes per-user BYOK + MCP safe: secrets live in the host agent instance for that
  turn, never in the sandbox.
- **Slack affordances become host-executed AI SDK tools** on the HarnessAgent. The compatibility
  goal for Part 1 is **1:1 old Gorkie native tool coverage** before expanding new behavior:
  `searchSlack`, `searchWeb`, `generateImage`, `getUserInfo`, `getWeather`, `summariseThread`,
  `readConversationHistory`, `mermaid`, `react`, `leaveChannel`, scheduling tools, and sandbox
  file-sharing affordances. Many platform tools come free
  from `createChatTools` from `chat/ai` (`fetchMessages`, `getUser`, `addReaction`,
  `fetchThread`, … with `needsApproval` built in on writes); hand-write only the rest
  (`searchWeb`, `getWeather`, `generateImage`, `mermaid`, scheduling, file upload). **`reply`
  and `skip` are dropped** — pi's streamed text *is* the message.
- **Tool/task rendering is per tool, not generic JSON summaries.** Do not rely on every tool
  returning a `summary` string. Keep a renderer layer that maps tool name + input/result/error to
  user-facing task rows: e.g. `generateImage` → "Generating image" / upload count / image error,
  `searchSlack` → result count, `sendDirectMessage` → recipient + success/failure, `postMessage`
  → target thread/channel, `addReaction` → emoji added, `fetchMessages` → message count. Internal
  Chat SDK tools need renderers too; wrap/override or post-process their results at the stream
  layer rather than weakening tool return types just for UI.
- **Steering: pi supports it, the AI SDK wrapper doesn't surface it yet** (see §4a). The current
  abort + re-prompt fallback is too janky because it re-enters provider retry/fallback and can
  feel like a fresh turn. Revert toward the old steering behavior: queue a mid-turn follow-up and
  deliver it at the next tool boundary (pi `one-at-a-time`) via a small patch exposing
  `submitUserMessage`.
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

### Sessions, `resumeState`, and where the transcript actually lives
*(Verified against `vercel/ai` `packages/harness*` + `earendil-works/pi` source.)*

- **`resumeState` is a small pointer/reconnect token, NOT the transcript.** Shape:
  `{ type:'resume-session', harnessId, specificationVersion, data:{ sessionFileName }, continueFrom? }`.
- **The transcript** (every message + tool call + result) is a **session file** pi's
  `SessionManager` writes — mirrored on the host (`hostSessionDir`, tmp) during a turn and
  copied **into the sandbox** at `${workdir}/.pi-sessions/<sessionFileName>` on `detach`/`stop`.
  Durability is "via the **sandbox snapshot**." On resume, pi pulls that file back from the
  sandbox (`pullSessionFileFromSandbox`).
- So `resumeState` "resumes the task" by pointing at *which* session file to reopen (and, via
  `continueFrom`, how to continue a turn that was mid-flight) — it does not carry the bytes.

Per turn = read-modify-write, keyed by `threadId`:
1. Load `resumeState` from Postgres (`sandboxSessions.resumeState`).
2. `agent.createSession({ sessionId: threadId, resumeFrom })` → reopens the session file.
3. `agent.stream({ session, prompt })` → pi runs, appending to the session file.
4. `session.detach()`/`stop()` → returns updated `resumeState` (+ persists the session file into
   the sandbox); write `resumeState` back to PG.

### detach vs stop vs destroy
- `detach()` — parks runtime, **keeps the sandbox warm**, returns resume state. (active/dev)
- `stop()` — saves resume state, **pauses the sandbox** (→ e2b `betaPause`). (idle/prod)
- `destroy()` — tears down, **discards** resumability.

### Persistence decision (Option 1 + mandatory mirror)
**Sandbox-primary, with a DB session-file mirror so history survives a sandbox kill.**
- While a sandbox lives (paused/active), resume reconnects to it — transcript file is present.
- e2b paused sandboxes persist indefinitely today; the janitor's window (e.g. 7 days) is our
  *own* policy, not an e2b limit. We do **not** want to depend on that (cost / future pricing).
- **Mirror (Phase 3, not "later"):** after each turn, read the pi session-file bytes and store
  them in Postgres; on resume into a **fresh** sandbox, re-seed the file into
  `${workdir}/.pi-sessions/<sessionFileName>` via `onSandboxSession` *before* pi reopens it.
  This makes conversation durability independent of any single sandbox. Uses pi's own file
  format — no upstream API needed.
- ⚠️ **Phase 3 verify:** confirm `resumeFrom` works against a *new* sandbox id (reference
  reconnects to the same one) and that `onSandboxSession` runs before pi's pull on resume.

### `onSandboxSession` (idempotent setup)
Runs on **fresh and resumed** sessions — (re)write pi's `SYSTEM.md`, make working dirs,
re-seed the mirrored session file, re-sync attachments. Must be safe to run every turn.

### Streaming to Slack
`agent.stream()` returns a `StreamTextResult` (has `.fullStream`/`.textStream`). `vercel/chat`'s
`thread.post(result.fullStream)` auto-detects it, extracts `text-delta`, injects `\n\n` between
steps, and handles `chat.update` throttling. No `reply`/`skip` tool — pi's streamed text *is*
the message.

### Steering (pi supports it; the AI SDK wrapper does not surface it yet)
*(Verified: `pi` `coding-agent` has `session.steer(msg)` with modes `one-at-a-time` "deliver
one, wait for response" and `all`. The harness V1 protocol defines
`HarnessV1PromptControl.submitUserMessage` and the pi adapter implements it as
`piSession.steer`. **But** `@ai-sdk/harness`'s `run-prompt` only calls `submitToolResult`/
`submitToolApproval`; the public `HarnessAgentSession` is one-turn-at-a-time and exposes no
`steer()`.)*
- **Target behavior** (your model): a follow-up that arrives mid-turn is **queued and
  delivered at the next tool boundary** (`one-at-a-time`), then pi resumes.
- **How:** small patch/extension to expose `submitUserMessage` from the live session (the
  protocol field already exists — low-risk, like the v1 `ai-retry` patch), keeping a live
  session handle for the in-flight turn.
- **Current fallback:** abort + re-prompt exists, but should be treated as temporary and replaced
  with the old-style queued steering path because retry/fallback orchestration makes it feel noisy.
- **TODO:** reduce visible reasoning/thinking gaps between tools; acceptable for now, but tool-to-tool
  flow should feel more immediate.

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
   per-thread pi transcript, which user B could see on resume. Resolution: MCP in
   shared/public threads is **opt-in per user** ("allow my MCP in public threads"); default
   is DMs / single-user threads only. Surface the result-in-history caveat at opt-in time.
4. **Canary coupling (low concern).** The brain depends on `@ai-sdk/harness@canary` +
   `@ai-sdk/harness-pi@canary`. Judged stable enough to build on directly (no seam).
   Light mitigation only: pin exact canary versions and keep one full-turn smoke test green
   when bumping. (`ai-retry` is removed as a dependency; rebuild its behavior at the Harness/pi
   boundary where model routing happens.)
5. **Harness retry/fallback is missing** — replicate the useful `ai-retry` behavior around
   Harness/pi turns so transient provider failures and provider-specific credit/token errors can
   retry with adjusted settings or an alternate provider without losing the thread session.
6. **BYOK is currently stubbed** — `createPi` hardcodes `OPENROUTER_API_KEY: env.HACKCLUB_API_KEY`.
   Real per-user keys must flow into `customEnv` per session.
7. **Compaction over long, multi-day Slack threads** is unverified for a coding harness — test it.

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

**Resolved (this round)**
- **D3 — Sandbox eagerness. ✅** **Every thread boots a sandbox** for now (pi requires a sandbox
  provider). AI SDK may relax pi's sandbox requirement later — revisit then.
- **D8 — e2b template. ✅** **Custom template**, re-derived from the reference's
  `build-template.ts` (base image + ripgrep/fd/imagemagick/ffmpeg/python/node 24 + agent-browser).
  Built in Phase 2.
- **D9 — Part-1 model. ✅** **HackClub AI** via pi `auth.customEnv` (OpenAI-compatible:
  `OPENROUTER_API_KEY=<hackclub key>`, base URL `https://ai.hackclub.com/proxy/v1`), like the
  reference. Multi-provider fallback/retry is a later step.
- **D10 — Env/secrets. ✅** Env in **`apps/bot/src/env.ts`** (t3-oss `createEnv`, extends
  `@repo/db/keys` + `@repo/logging/keys`, HackClub key inlined). Part-1 vars only; replicate
  `.env.example` + `slack-manifest.json` from the reference. **`db:push` targets the staging DB.**

**Still open**
- **D5 — `apps/server` fate. ✅ (deferred-decided)** Deleted now; re-introduced in the MCP
  phase as the MCP OAuth callback host (+ webhook receiver if not socket-mode).
- **D6 — Single MCP encryption key.** v1 uses one server-wide `MCP_ENCRYPTION_KEY`. Move to
  envelope / per-user key derivation?
- **D7 — Provider fallback under pi.** Replicate `ai-retry` semantics for Harness/pi: classify
  provider failures, cap excessive output-token defaults, retry transient failures, and fall back
  across configured providers/models while preserving the current thread/session state.
- **D8 — e2b template (Phase 2).** pi runs on host, so the sandbox only needs a base image +
  whatever runtimes code-exec needs. Use a stock e2b base or build a custom `gorkie` template?
- **D9 — Part-1 model + key (Phase 2).** Which model does pi use with the single shared key —
  AI Gateway (`AI_GATEWAY_API_KEY`), or a direct provider via `auth.customEnv`? Pick one model
  for the core happy path.
- **D10 — Env/secrets schema (Phase 0).** Define `packages/config` env: `SLACK_BOT_TOKEN`,
  `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`, `E2B_API_KEY`, `DATABASE_URL`, the model key. (Old
  `.env.example` deleted; regenerate from the new schema.)

## 10. Build plan

Each phase: design fresh (reference for understanding only) → build clean → vet
(types, ultracite, a full-turn smoke test) → mark done.

### Part 1 — Core layer (single shared key, thread-only)
- **Phase 0 — Skeleton.** Gut `apps/bot` (done); keep `tooling/*` + `packages/{db,validators,utils,logging}`.
  Replicate `apps/bot/src/env.ts` (Part-1 vars) + `.env.example` + `slack-manifest.json` from the
  reference; add deps (`chat`, `@chat-adapter/slack`, `@chat-adapter/state-pg`, `e2b`,
  `@e2b/code-interpreter`; harness already pinned); `bun install`; `db:push` to staging.
- **Phase 1 — Platform layer.** `vercel/chat` Slack adapter (socket mode), event routing,
  streaming sink to `thread.post`. Hello-world reply, no agent.
- **Phase 2 — Harness brain.** `HarnessAgent(pi)` per thread, **HackClub** via `auth.customEnv`;
  unified system prompt; e2b provider + **custom template** (re-derive `build-template.ts`);
  every thread boots a sandbox; stream pi text → Slack (no `reply`/`skip` tools).
- **Phase 2.5 — Steering.** Abort-&-re-prompt shipped, but it is temporary and should be reverted
  toward the old steering behavior: patch `@ai-sdk/harness` to expose `submitUserMessage` so a
  mid-turn follow-up queues and delivers at the next tool boundary (pi `one-at-a-time`). See §4a.
- **Phase 2.75 — Harness retry/fallback.** Rebuild the useful `ai-retry` behavior for Harness/pi
  turns: provider-error classification, output-token caps, transient retry, and alternate provider
  fallback without dropping the pi transcript or Slack stream state.
- **Phase 3 — Persistence + session-file mirror.** `resumeState` pointer in `sandbox_sessions`
  **plus** mirroring pi's session-file bytes to Postgres each turn and re-seeding into a fresh
  sandbox via `onSandboxSession` on resume. Verify: history survives sandbox **death** (not
  just restart), `resumeFrom` works against a new sandbox id, and compaction holds on long threads.
- **Phase 4 — Core conversation tools.** Bring back every old Gorkie native tool or an intentional
  v2 equivalent. Use `createChatTools` (`chat/ai`) for compatible platform operations
  (`fetchMessages`/`getUser`/`addReaction`/etc.); hand-write bot-owned tools under
  `apps/bot/src/lib/ai/tools/*` (`searchSlack`, `searchWeb`, `getWeather`, `generateImage`,
  `mermaid`, file upload, scheduling). Do not remove old tool capability just because pi has
  built-ins; preserve the old user-facing affordance first, then simplify internals later.
  Verify every restored old Gorkie skill/tool with at least one live or harnessed smoke path:
  Slack search, web search, image generation/upload, user lookup, weather, thread summary,
  conversation history, Mermaid upload, reactions, leaving channels, reminders, recurring tasks,
  scheduled-task listing/cancel, sandbox file sharing, and Chat SDK internal tools (`sendDirectMessage`,
  `postMessage`, `postChannelMessage`, `fetchMessages`, `fetchChannelMessages`, `listThreads`,
  `getChannelInfo`, `getUser`, `addReaction`, `removeReaction`). Add per-tool task renderers for
  success and error states as each tool lands; avoid generic `summary` as the primary UI contract.
- **Phase 4.5 — Langfuse observability.** Use AI SDK telemetry via `@ai-sdk/otel` plus
  Langfuse's `LangfuseSpanProcessor`; do not maintain custom stream-derived Langfuse spans.
  The env schema already accepts `LANGFUSE_*`; tracing stays optional and inert when the env vars
  are absent. Validate with one live Slack turn and confirm Langfuse receives AI SDK model/tool
  spans plus the final outcome. If Harness/pi later exposes richer native telemetry, prefer the
  upstream signal over app-level glue.

### Part 2 — later (must not block Part 1)
- **Phase 5 — BYOK.** Postponed much further. Per-user keys → `customEnv`; per-user agent
  instances closed over the replying user's secrets; key storage. Introduces per-user secret isolation.
- **Phase 6 — MCP (per D1).** Postponed much further. Re-derive MCP (encrypted creds, OAuth,
  approval) + bring back `apps/server` for the OAuth callback; gate to DMs / single-user threads first.
- **Phase 7 — App Home & MCP UI.** Build on Chat SDK + `WebClient.views.publish`.
- **Phase 8 — Scheduled tasks** + janitor tuning.
- **Phase 9 — Diversification proof.** Postponed much further. Add a Discord adapter to validate the seam.

## 11. Stack / tooling changes
- On **AI SDK 7 beta** (`ai`, `@ai-sdk/harness*`, `@ai-sdk/harness-pi`, `@ai-sdk/otel`, and
  `@ai-sdk/mcp` in Part 2).
- **Bolt removed**, replaced by `vercel/chat` + `@chat-adapter/slack` (socket mode).
- **`apps/server` deleted** — returns in Part 2 only as the MCP OAuth callback host.
- **`packages/kv` deleted.** If we need Chat SDK state (locks/dedup), use `@chat-adapter/state-pg`
  or `state-redis` directly.
- **`packages/ai` kept** for platform-neutral harness/provider/prompt code; bot-owned tools live
  under `apps/bot/src/lib/ai/tools/*`.
- **No bot bundling while running locally.** `apps/bot` runs TypeScript directly with Bun; do not
  keep `tsdown` or a `build` script unless a real deploy/distribution target is added.
- `ai-retry` + patch removed as a dependency; re-implement its fallback behavior around Harness/pi
  where the model call actually happens.
- New drizzle tables (fresh, no back-compat): `sandbox_sessions` (with `resumeState` pointer +
  mirrored pi session-file bytes); MCP/scheduled tables arrive with Part 2.
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

### Avoid constants unless absolutely needed
Do not introduce named constants for one-use values, obvious literals, or values that are clearer inline. Constants are allowed only when the name carries real domain meaning, prevents dangerous drift across multiple uses, or centralizes a true tuneable/config value.

```ts
// bad - the name adds no domain value
const STOP_TURN_ACTION = 'gorkie_stop_turn';
bot.onAction(STOP_TURN_ACTION, handler);

// good - keep the local one-use value visible
bot.onAction('gorkie_stop_turn', handler);
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
Anything that could reasonably change per deployment (thresholds, message lists, locale) belongs in the owning app/package config, not inline in feature code.

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

## 13. References & docs

This plan summarizes; the **source of truth is the docs/repos** — read them when implementing,
and ask questions freely.

**Chat SDK packages:**
- `chat` — core SDK: the `Chat` class, types, JSX runtime, and utilities.
- `chat/ai` — AI utilities: `createChatTools` (expose chat operations as AI SDK tools) and
  `toAiMessages` (convert chat history → AI SDK prompt messages).
- `@chat-adapter/slack` — Slack adapter: webhooks, Block Kit cards, OAuth, slash commands, AI
  streaming; plus the raw `WebClient` + `callSlackApi` escape hatches.

**Docs / source to consult:**
- Skills: `chat-sdk`, `ai-sdk`, `slack-agent`, `ultracite`, `coding-best-practices`, `neon-postgres`.
- AI SDK harness docs: `https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/*` (overview, harness-agent,
  adapters, tools, ui, terminal-ui) + the pi provider page.
- Clone & read source for canary/undocumented APIs: `vercel/ai`, `vercel/chat`,
  `earendil-works/pi`.
- **GitHub issues** — check the relevant repos' open issues for known bugs/limitations before
  relying on undocumented behavior.
- The `reference` worktree (v1) for how a hard piece was previously solved.

**Plan of attack:** before each phase, walk through the relevant prompts + the references above
(Chat SDK + `chat/ai`, AI SDK harness, GitHub issues). Don't build blind; confirm understanding,
then implement step by step.
