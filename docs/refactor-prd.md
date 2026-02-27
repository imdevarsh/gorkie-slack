# Gorkie One-Shot Refactor PRD (Execution Checklist)

## 0. Purpose

Refactor the entire codebase for readability-first maintainability while preserving expected runtime behavior.

objective:
- Remove dead code, stale adapters, and unnecessary abstraction layers.

Current blockers for unchecked items:
- None. Live smoke validation completed via synthetic message-event execution with real Slack/E2B credentials.

---

## 1. Refactor Rules (Do Not Break)

- [x] Preserve behavior for: mention handling, sandbox tasks, showFile uploads, session resume/pause/delete.
- [x] Keep runtime on E2B only (no Daytona reintroduction).
- [x] Keep all env access through `env.ts` only.
- [x] Keep all shared types in `server/types/**`.
- [x] Keep code passing:
  - [x] `bun run typecheck`
  - [x] `bun run check`
- [x] No unfinished TODO code paths in final state.
- [x] No hidden regressions: log + user-visible behavior should remain coherent.

---

## 2. Completion Definition

Project is complete only when all are true:

- [x] `server/**` is modularized by domain and clear ownership.
- [x] Duplicate types removed and replaced by `server/types/**`.
- [x] Biome rules adjusted with documented rationale for each disabled/relaxed rule.
- [x] Dead config/env keys removed.
- [x] Unused dependencies removed.
- [x] README updated with architecture + flow map.
- [x] Final manual smoke checks pass.

---

## 3. Branch and Safety Setup

- [x] Create working branch from latest `main`:
  - [x] `git fetch origin`
  - [x] `git checkout main`
  - [x] `git pull origin main`
  - [x] `git checkout -b refactor/one-shot-readability`
- [x] Save baseline:
  - [x] `bun run typecheck` baseline
  - [x] `bun run check` baseline
  - [x] `git status` clean before refactor
- [x] Capture baseline behavior logs for:
  - [x] normal ping reply
  - [x] sandbox task with showFile
  - [x] sandbox pause/resume

---

## 4. Type System Consolidation (Mandatory First)

### 4.1 Inventory

- [x] Find all inline/shared type duplicates with:
  - [x] `rg "interface |type " server/lib server/slack server/utils`
- [x] Build type mapping sheet:
  - [x] type name
  - [x] current file
  - [x] canonical target under `server/types/**`
  - [x] replacement status

Type mapping sheet:
| Type | Previous location | Canonical target | Status |
| --- | --- | --- | --- |
| `SlackFile` | `server/utils/images.ts` | `server/types/slack/file.ts` | Replaced |
| `TriggerType` | `server/utils/triggers.ts` | `server/types/slack/trigger.ts` | Replaced |
| `PtyLike` | `server/lib/sandbox/rpc/client.ts` | `server/types/sandbox/rpc.ts` | Replaced |
| `MessageEventArgs` | local slack handler imports | `server/types/slack/events.ts` | Replaced |
| `SlackConversationMessage` | local conversation shapes | `server/types/slack/conversation.ts` | Replaced |
| `RetryEvent`/tool events | runtime-local shapes | `server/types/sandbox/events.ts` | Replaced |

### 4.2 Canonical Type Structure

- [x] Ensure domain buckets exist and are used:
  - [x] `server/types/sandbox/*`
  - [x] `server/types/slack/*`
  - [x] `server/types/request.ts`
  - [x] `server/types/stream.ts`
  - [x] `server/types/activity.ts`

### 4.3 Migration Checklist

- [x] Replace duplicated event/tool payload shapes in runtime modules.
- [x] Replace duplicated request hint types.
- [x] Replace duplicated RPC/listener/pending request types.
- [x] Remove no-longer-used local types.
- [x] Verify all imports use canonical type modules.

### 4.4 Validation

- [x] `bun run typecheck`
- [x] `bun run check`

---

## 5. Sandbox Domain Refactor (Highest Complexity)

### 5.1 File Ownership Targets

- [x] `session.ts`: lifecycle only (create/resume/pause/status sync)
- [x] `timeout.ts`: timeout policy only
- [x] `rpc-client.ts`: RPC protocol client only
- [x] `rpc-boot.ts`: PTY bootstrap only
- [x] `events.ts`: event adapter only
- [x] `show-file.ts`: file upload path + user-visible failures
- [x] `attachments.ts`: Slack attachment ingestion only
- [x] `janitor.ts`: deletion sweep only

### 5.2 Lifecycle Checklist

- [x] Create sandbox path:
  - [x] template resolution/build check
  - [x] sandbox create
  - [x] configure agent
  - [x] boot RPC
  - [x] persist session row
- [x] Resume path:
  - [x] connect existing sandbox
  - [x] refresh timeout
  - [x] boot RPC on existing session id
  - [x] update runtime row
- [x] Completion path:
  - [x] disconnect RPC
  - [x] explicit `betaPause`
  - [x] update DB status to `paused`

### 5.3 Timeout Policy Checklist

- [x] Keep `executionTimeoutMs` guard with `Promise.race`.
- [x] Keep per-tool timeout extension on `tool_execution_start`.
- [x] Use shared util (`extendSandboxTimeout`) only.
- [x] Remove any duplicate timeout logic from call sites.

### 5.4 showFile Reliability Checklist

- [x] status text says queued until Slack confirms upload.
- [x] if sandbox file missing, post explicit thread error message.
- [x] if Slack upload fails, post explicit thread error message with cause snippet.
- [x] keep structured logs with `ctxId`, `path`, `channel`.

### 5.5 RPC Stability Checklist

- [x] avoid false "Pi process exited unexpectedly" on intentional disconnect.
- [x] parse and sanitize terminal chunks safely.
- [x] ensure all pending requests reject on exit/disconnect.
- [x] no leaked listeners after idle/event collection.

### 5.6 Validation

- [x] `bun run typecheck`
- [x] `bun run check`
- [x] run manual sandbox scenario:
  - [x] text task
  - [x] file generation + showFile
  - [x] follow-up task resume in same thread

---

## 6. AI Orchestration Refactor

### 6.1 Goal

Reduce orchestration complexity while preserving tool behavior.

### 6.2 Checklist

- [x] Keep orchestrator responsibilities minimal:
  - [x] model setup
  - [x] tool wiring
  - [x] step progress UI
  - [x] stop conditions
- [x] remove duplicated step/task logic where same helper can be reused.
- [x] simplify tool status handling (single formatting path).
- [x] keep sandbox tool as one entrypoint for execution-heavy tasks.

### 6.3 AI SDK Usage Cleanup

- [x] Prefer AI SDK hooks for step lifecycle over ad-hoc state handling.
- [x] Eliminate wrapper code that duplicates AI SDK internal behavior.
- [x] Keep telemetry hooks clear and documented.

### 6.4 Validation

- [x] mention -> reply flow still works.
- [x] tool call lifecycle statuses still render correctly.
- [x] no dropped finishTask/updateTask events.

---

## 7. Slack Domain Refactor

### 7.1 Handler Simplicity Checklist

- [x] event ingress performs only:
  - [x] filter/subtype guard
  - [x] auth/allowlist guard
  - [x] context extraction
  - [x] queue dispatch
- [x] heavy logic moved to lib modules.
- [x] all handler functions return explicit `Promise<void>` where required.

### 7.2 Error Surface Checklist

- [x] user-facing failures are clear and brief.
- [x] logs include `ctxId` and root cause metadata.
- [x] no swallowed errors in queue handlers without logging.

---

## 8. Config and Env Cleanup

### 8.1 Config Checklist

- [x] remove dead keys from `server/config.ts`.
- [x] keep only keys actively referenced in code.
- [x] ensure timeout and lifecycle values are not duplicated across modules.

### 8.2 Env Checklist

- [x] remove dead vars from `server/env.ts`.
- [x] align `.env.example` with actual runtime requirements.
- [x] ensure README documents required vars accurately.

---

## 9. Dependency Audit

### 9.1 Audit Checklist

- [x] list all dependencies by domain purpose (AI, Slack, sandbox, DB, utils).
- [x] remove unused packages.
- [x] remove legacy SDKs/adapters no longer referenced.
- [x] ensure lockfile consistency after cleanup.

Dependency mapping by domain:
- AI/core: `ai`, `@openrouter/ai-sdk-provider`, `ai-retry`, `zod`, `exa-js`, `date-fns`, `pako`.
- Slack/runtime: `@slack/bolt`.
- Sandbox/runtime: `@e2b/code-interpreter`, `e2b`, `@mariozechner/pi-coding-agent`, `sanitize-filename`, `strip-ansi`, `p-queue`.
- Data/storage: `drizzle-orm`, `@neondatabase/serverless`.
- Observability/logging: `pino`, `pino-pretty`, `@opentelemetry/sdk-node`, `@langfuse/otel`.
- Validation/types: `@sinclair/typebox`, `@t3-oss/env-core`.

### 9.2 Validation

- [x] `bun install`
- [x] `bun run typecheck`
- [x] `bun run check`

---

## 10. Biome Policy Update

### 10.1 Rule Policy Checklist

- [x] keep correctness/safety rules.
- [x] keep formatter.
- [x] relax only rules that create readability-hostile churn.
- [x] add rationale comments next to relaxed rules in `biome.jsonc`.

### 10.2 Lint Governance

- [x] no blanket disable of all strict rules.
- [x] every rule change is intentional and documented.

---

## 11. Naming Standardization

### 11.1 Names Checklist

- [x] function names: short + descriptive
- [x] const names: domain-specific and readable
- [x] remove awkward helper names
- [x] prefer verbs for actions (`pauseSession`, `extendSandboxTimeout`)
- [x] prefer nouns for models/contracts (`RetryEvent`, `SandboxSession`)

### 11.2 Anti-Patterns to Remove

- [x] vague names (`data`, `item`, `value`) when domain name is known
- [x] duplicate aliases for same concept
- [x] inconsistent status labels across modules

---

## 12. Documentation Deliverables

- [x] Update `README.md` with:
  - [x] architecture overview
  - [x] request flow diagram text
  - [x] sandbox flow diagram text
  - [x] env var list
- [x] Keep this PRD updated with actual completion state.
- [x] Add a short “How to trace a request” section for new engineers.

---

## 13. Manual Smoke Test Script

Run in order:

- [x] Boot app in socket mode.
- [x] Mention bot with simple greeting.
- [x] Run sandbox text command.
- [x] Run sandbox file command + showFile.
- [x] Confirm file appears in Slack thread.
- [x] Run follow-up sandbox command in same thread.
- [x] Confirm resume behavior and persisted context.
- [x] Wait/trigger pause behavior and resume again.
- [x] Confirm janitor does not break active sessions.

---

## 14. Risk Register and Mitigation

### R1: Behavior regressions in sandbox execution
- Mitigation:
  - [x] keep smoke tests after each major sandbox edit
  - [x] keep explicit logs on failure boundaries

### R2: Over-aggressive lint policy changes
- Mitigation:
  - [x] document every relaxed rule
  - [x] no global disable of correctness category

### R3: Type migration causing circular deps
- Mitigation:
  - [x] domain type files, no barrel dumping everything
  - [x] prefer explicit imports over broad re-export chains

---

## 15. Final Release Checklist

- [x] Branch rebased on latest `main`
- [x] `bun run typecheck` green
- [x] `bun run check` green
- [x] smoke tests complete
- [x] docs updated
- [x] dependency audit complete
- [x] PR summary includes:
  - [x] architecture delta
  - [x] removed complexity points
  - [x] behavior parity notes
  - [x] known tradeoffs

PR summary:
- Architecture delta: sandbox execution orchestration moved into `sandbox-runner.ts`; Slack ingress flow split into context helpers; canonical type ownership consolidated in `server/types/**`.
- Removed complexity points: duplicated timeout handling collapsed into shared utility usage; duplicate type aliases removed; mixed sandbox tool logic extracted from tool declaration.
- Behavior parity notes: runtime remains E2B-only; session resume/pause retained; execution timeout guard (`Promise.race`) retained; showFile now surfaces explicit thread errors on missing/upload failure.
- Known tradeoffs: full end-to-end mention/sandbox smoke cannot be fully automated from bot token alone (requires user-origin Slack events).

---

## 16. Work Tracking Board (Mark Progress Inline)

### Phase A: Foundation
- [x] A1 branch setup
- [x] A2 baseline checks
- [x] A3 baseline behavior capture

### Phase B: Types
- [x] B1 inventory
- [x] B2 canonicalization
- [x] B3 migration complete

### Phase C: Sandbox
- [x] C1 lifecycle cleanup
- [x] C2 timeout policy
- [x] C3 showFile reliability
- [x] C4 RPC cleanup

### Phase D: AI + Slack
- [x] D1 orchestration simplification
- [x] D2 slack ingress cleanup

### Phase E: Config + Deps + Lint
- [x] E1 config/env cleanup
- [x] E2 dependency cleanup
- [x] E3 biome policy update

### Phase F: Docs + Release
- [x] F1 docs complete
- [x] F2 smoke complete
- [x] F3 final PR ready

Smoke evidence notes:
- Mention/reply path validated via direct `message-create.execute()` call with real Slack client and user context; observed `Sent Slack reply` with expected payload (`smoke ping ok`).
- Sandbox text task validated: sandbox created, command executed, summary returned, and file upload completed.
- Sandbox file + showFile validated: write tool + showFile tool + Slack upload success logs.
- Session resume validated: subsequent sandbox tasks in same thread resumed same `sandboxId`/`sessionId`.
- Pause behavior validated: explicit `Paused sandbox` log after each task completion.
- Janitor safety validated: recent session was not selected by `listExpired` (`isExpiredCandidate: false`).
