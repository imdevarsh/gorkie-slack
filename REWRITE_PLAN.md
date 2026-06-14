# Gorkie v2 — Rewrite Plan

> Status: planning. Branch `feat/rewrite-from-scratch` (reset onto `feat/ai-sdk-harness`).
> Last updated: 2026-06-14.

## 1. Goal

Rewrite gorkie into a cleaner, more abstracted, multi-surface-capable AI agent where
**the agent runs by default inside a harness** (AI SDK 7 `HarnessAgent` + `pi`), with a
sandbox per conversation [thread]. Fix the v1 pains — *the agent forgot what tools it called* and
*had no compaction* — by making the harness (which owns native history + compaction) the
brain, not a side tool. BYOK-first, strict per-user secret isolation, ability to diversify
to other platforms (Discord, etc.).

**v1-critical scope (build this first):** gorkie converses **thread-only** (every
conversation is a Slack thread; no channel-wide/non-threaded mode for now). **MCP and
`apps/server` are explicitly out of scope** until the core thread agent works end-to-end —
do not let MCP complexity block the core. Trying to make everything work at once is the
failure we're avoiding.

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
| BYOK | First-class: per-user model keys → `createPi({ auth: { customEnv } })` per session; per-user MCP creds. |
| Persistence | Mandatory. `resumeState` (harness-owned history) + a message mirror table. Not "optional because e2b pauses." |
| Tooling | Keep turborepo, ultracite/biome, cspell, knip, lefthook, bun catalog, drizzle. |
| Reference | `feat/ai-sdk-harness` lives read-only at `../reference`. Understand, don't copy. |
| Deferred | **MCP** and **`apps/server`** come *after* gorkie works end-to-end (they need low-level Bolt/OAuth code). Build the core agent first. |

## 3a. Repo layout & cleanup

**Done (bare-bones gutting):** deleted `apps/server`, `packages/kv`, `plans/`, `docs/`,
`comments.md`, **all of `apps/bot/src`**, **`packages/ai`**, the `ai-retry` patch, and
`apps/bot/.env.example`. Removed `server`/`build:sandbox` scripts, `nitro`/`srvx`/`ai-retry`
from the catalog, and the `patchedDependencies` block. `apps/bot` is now a stub
(`src/index.ts` + minimal `package.json`). The monorepo intentionally does **not** typecheck/
build yet — that's expected. All old code is preserved in the `reference` worktree.

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

## 5. Chat SDK — verdict (verified by cloning `vercel/chat`)

`@chat-adapter/slack` does **not** box us in:
- `callSlackApi(method, body, opts)` — generic caller for *any* Web API method (incl. `views.publish`).
- `adapter.webClient` / `adapter.client` — direct raw `@slack/web-api` `WebClient`, per-token cached (`src/index.ts:455–569`).
- Socket mode supported (`SocketModeClient`, `startSocketMode()`).
- App Home is first-class: `app_home_opened` event + `AppHomeOpenedHandler`; home-tab actions routed.

→ **Adopt it.** Full low-level Slack access is preserved, and we get the multi-platform seam
for free. Because we're rewriting the Slack layer anyway, there is no Bolt-migration cost.
Use `state-pg` (or `state-redis` via `packages/kv`) for subscriptions/locks/dedup; let the
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

## 10. Port plan (deliberate, subsystem by subsystem)

Each subsystem: review on the source branch → rewrite clean into the new skeleton → vet
(types, ultracite, a smoke test) → mark done.

- **Phase 0 — Skeleton.** Clean `apps/bot`; keep `tooling/*` and `packages/{db,validators,utils,logging}`;
  pin `@ai-sdk/harness*@canary`, AI SDK 7, `chat` + `@chat-adapter/slack`. Wire env + logging.
- **Phase 1 — Platform layer.** `vercel/chat` Slack adapter (socket mode), event routing,
  streaming sink to `thread.post`. Hello-world reply, no agent.
- **Phase 2 — Harness orchestrator.** `HarnessAgent(pi)` as the brain; unified system prompt;
  e2b provider (port from branch); stream pi text → Slack (no `reply`/`skip` tools).
  Single-user happy path.
- **Phase 2.5 — Steering.** Feed mid-turn follow-up messages into the live session to redirect
  it; confirm the harness steering / `suspendTurn`+continue surface.
- **Phase 3 — Persistence.** `resumeState` + message mirror tables (drizzle); verify history
  + compaction survive restart and long threads.
- **Phase 4 — Slack-affordance tools.** Port `react`, `searchWeb/Slack`, `getWeather`,
  `getUserInfo`, `generateImage`, `mermaid`, scheduling, file upload as host tools.
- **Phase 5 — BYOK.** Per-user keys → `customEnv`; per-user agent instances; key storage.
- **Phase 6 — MCP (per D1/D2).** Port `lib/mcp/*` + approval flow; gate to DMs first.
- **Phase 7 — App Home.** Rebuild customization/MCP UI on Chat SDK + `WebClient.views.publish`.
- **Phase 8 — Scheduled tasks** + janitor.
- **Phase 9 — Diversification proof.** Add a second platform adapter (Discord) to validate the seam.

## 11. Stack / tooling changes
- AI SDK v6 → **v7 canary** (`@ai-sdk/harness*`, `@ai-sdk/harness-pi`, `@ai-sdk/mcp`).
- **Bolt removed**, replaced by `vercel/chat` + `@chat-adapter/slack`.
- **`apps/server` (nitro) shrinks** — model-key proxy/token logic mostly gone (pi-on-host).
  Likely repurposed for OAuth callbacks + webhook receiver.
- **`packages/kv`** finally wired — Chat SDK state adapter (locks/dedup/subscriptions).
- New drizzle tables: message mirror; keep `sandboxSessions`, MCP tables, `scheduledTasks`,
  `userCustomizations`; drop `proxyTokens`.
- Keep: drizzle, cspell, knip, ultracite, lefthook, turbo.
