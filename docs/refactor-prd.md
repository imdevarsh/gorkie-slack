# Gorkie One-Shot Refactor PRD (Execution Checklist)

## 0. Purpose

Refactor the entire codebase for readability-first maintainability while preserving expected runtime behavior.

Primary objective:
- Any junior engineer should be able to trace request flow, sandbox flow, and failure flow quickly.

Secondary objective:
- Remove redundancy, dead code, stale adapters, and unnecessary abstraction layers.

---

## 1. Refactor Rules (Do Not Break)

- [ ] Preserve behavior for: mention handling, sandbox tasks, showFile uploads, session resume/pause/delete.
- [ ] Keep runtime on E2B only (no Daytona reintroduction).
- [ ] Keep all env access through `env.ts` only.
- [ ] Keep all shared types in `server/types/**`.
- [ ] Keep code passing:
  - [ ] `bun run typecheck`
  - [ ] `bun run check`
- [ ] No unfinished TODO code paths in final state.
- [ ] No hidden regressions: log + user-visible behavior should remain coherent.

---

## 2. Completion Definition

Project is complete only when all are true:

- [ ] `server/**` is modularized by domain and clear ownership.
- [ ] Duplicate types removed and replaced by `server/types/**`.
- [ ] Biome rules adjusted with documented rationale for each disabled/relaxed rule.
- [ ] Dead config/env keys removed.
- [ ] Unused dependencies removed.
- [ ] README updated with architecture + flow map.
- [ ] Final manual smoke checks pass.

---

## 3. Branch and Safety Setup

- [ ] Create working branch from latest `main`:
  - [ ] `git fetch origin`
  - [ ] `git checkout main`
  - [ ] `git pull origin main`
  - [ ] `git checkout -b refactor/one-shot-readability`
- [ ] Save baseline:
  - [ ] `bun run typecheck` baseline
  - [ ] `bun run check` baseline
  - [ ] `git status` clean before refactor
- [ ] Capture baseline behavior logs for:
  - [ ] normal ping reply
  - [ ] sandbox task with showFile
  - [ ] sandbox pause/resume

---

## 4. Type System Consolidation (Mandatory First)

### 4.1 Inventory

- [ ] Find all inline/shared type duplicates with:
  - [ ] `rg "interface |type " server/lib server/slack server/utils`
- [ ] Build type mapping sheet:
  - [ ] type name
  - [ ] current file
  - [ ] canonical target under `server/types/**`
  - [ ] replacement status

### 4.2 Canonical Type Structure

- [ ] Ensure domain buckets exist and are used:
  - [ ] `server/types/sandbox/*`
  - [ ] `server/types/slack/*`
  - [ ] `server/types/request.ts`
  - [ ] `server/types/stream.ts`
  - [ ] `server/types/activity.ts`

### 4.3 Migration Checklist

- [ ] Replace duplicated event/tool payload shapes in runtime modules.
- [ ] Replace duplicated request hint types.
- [ ] Replace duplicated RPC/listener/pending request types.
- [ ] Remove no-longer-used local types.
- [ ] Verify all imports use canonical type modules.

### 4.4 Validation

- [ ] `bun run typecheck`
- [ ] `bun run check`

---

## 5. Sandbox Domain Refactor (Highest Complexity)

### 5.1 File Ownership Targets

- [ ] `session.ts`: lifecycle only (create/resume/pause/status sync)
- [ ] `timeout.ts`: timeout policy only
- [ ] `rpc-client.ts`: RPC protocol client only
- [ ] `rpc-boot.ts`: PTY bootstrap only
- [ ] `events.ts`: event adapter only
- [ ] `show-file.ts`: file upload path + user-visible failures
- [ ] `attachments.ts`: Slack attachment ingestion only
- [ ] `janitor.ts`: deletion sweep only

### 5.2 Lifecycle Checklist

- [ ] Create sandbox path:
  - [ ] template resolution/build check
  - [ ] sandbox create
  - [ ] configure agent
  - [ ] boot RPC
  - [ ] persist session row
- [ ] Resume path:
  - [ ] connect existing sandbox
  - [ ] refresh timeout
  - [ ] boot RPC on existing session id
  - [ ] update runtime row
- [ ] Completion path:
  - [ ] disconnect RPC
  - [ ] explicit `betaPause`
  - [ ] update DB status to `paused`

### 5.3 Timeout Policy Checklist

- [ ] Keep `executionTimeoutMs` guard with `Promise.race`.
- [ ] Keep per-tool timeout extension on `tool_execution_start`.
- [ ] Use shared util (`extendSandboxTimeout`) only.
- [ ] Remove any duplicate timeout logic from call sites.

### 5.4 showFile Reliability Checklist

- [ ] status text says queued until Slack confirms upload.
- [ ] if sandbox file missing, post explicit thread error message.
- [ ] if Slack upload fails, post explicit thread error message with cause snippet.
- [ ] keep structured logs with `ctxId`, `path`, `channel`.

### 5.5 RPC Stability Checklist

- [ ] avoid false "Pi process exited unexpectedly" on intentional disconnect.
- [ ] parse and sanitize terminal chunks safely.
- [ ] ensure all pending requests reject on exit/disconnect.
- [ ] no leaked listeners after idle/event collection.

### 5.6 Validation

- [ ] `bun run typecheck`
- [ ] `bun run check`
- [ ] run manual sandbox scenario:
  - [ ] text task
  - [ ] file generation + showFile
  - [ ] follow-up task resume in same thread

---

## 6. AI Orchestration Refactor

### 6.1 Goal

Reduce orchestration complexity while preserving tool behavior.

### 6.2 Checklist

- [ ] Keep orchestrator responsibilities minimal:
  - [ ] model setup
  - [ ] tool wiring
  - [ ] step progress UI
  - [ ] stop conditions
- [ ] remove duplicated step/task logic where same helper can be reused.
- [ ] simplify tool status handling (single formatting path).
- [ ] keep sandbox tool as one entrypoint for execution-heavy tasks.

### 6.3 AI SDK Usage Cleanup

- [ ] Prefer AI SDK hooks for step lifecycle over ad-hoc state handling.
- [ ] Eliminate wrapper code that duplicates AI SDK internal behavior.
- [ ] Keep telemetry hooks clear and documented.

### 6.4 Validation

- [ ] mention -> reply flow still works.
- [ ] tool call lifecycle statuses still render correctly.
- [ ] no dropped finishTask/updateTask events.

---

## 7. Slack Domain Refactor

### 7.1 Handler Simplicity Checklist

- [ ] event ingress performs only:
  - [ ] filter/subtype guard
  - [ ] auth/allowlist guard
  - [ ] context extraction
  - [ ] queue dispatch
- [ ] heavy logic moved to lib modules.
- [ ] all handler functions return explicit `Promise<void>` where required.

### 7.2 Error Surface Checklist

- [ ] user-facing failures are clear and brief.
- [ ] logs include `ctxId` and root cause metadata.
- [ ] no swallowed errors in queue handlers without logging.

---

## 8. Config and Env Cleanup

### 8.1 Config Checklist

- [ ] remove dead keys from `server/config.ts`.
- [ ] keep only keys actively referenced in code.
- [ ] ensure timeout and lifecycle values are not duplicated across modules.

### 8.2 Env Checklist

- [ ] remove dead vars from `server/env.ts`.
- [ ] align `.env.example` with actual runtime requirements.
- [ ] ensure README documents required vars accurately.

---

## 9. Dependency Audit

### 9.1 Audit Checklist

- [ ] list all dependencies by domain purpose (AI, Slack, sandbox, DB, utils).
- [ ] remove unused packages.
- [ ] remove legacy SDKs/adapters no longer referenced.
- [ ] ensure lockfile consistency after cleanup.

### 9.2 Validation

- [ ] `bun install`
- [ ] `bun run typecheck`
- [ ] `bun run check`

---

## 10. Biome Policy Update

### 10.1 Rule Policy Checklist

- [ ] keep correctness/safety rules.
- [ ] keep formatter.
- [ ] relax only rules that create readability-hostile churn.
- [ ] add rationale comments next to relaxed rules in `biome.jsonc`.

### 10.2 Lint Governance

- [ ] no blanket disable of all strict rules.
- [ ] every rule change is intentional and documented.

---

## 11. Naming Standardization

### 11.1 Names Checklist

- [ ] function names: short + descriptive
- [ ] const names: domain-specific and readable
- [ ] remove awkward helper names
- [ ] prefer verbs for actions (`pauseSession`, `extendSandboxTimeout`)
- [ ] prefer nouns for models/contracts (`RetryEvent`, `SandboxSession`)

### 11.2 Anti-Patterns to Remove

- [ ] vague names (`data`, `item`, `value`) when domain name is known
- [ ] duplicate aliases for same concept
- [ ] inconsistent status labels across modules

---

## 12. Documentation Deliverables

- [ ] Update `README.md` with:
  - [ ] architecture overview
  - [ ] request flow diagram text
  - [ ] sandbox flow diagram text
  - [ ] env var list
- [ ] Keep this PRD updated with actual completion state.
- [ ] Add a short “How to trace a request” section for new engineers.

---

## 13. Manual Smoke Test Script

Run in order:

- [ ] Boot app in socket mode.
- [ ] Mention bot with simple greeting.
- [ ] Run sandbox text command.
- [ ] Run sandbox file command + showFile.
- [ ] Confirm file appears in Slack thread.
- [ ] Run follow-up sandbox command in same thread.
- [ ] Confirm resume behavior and persisted context.
- [ ] Wait/trigger pause behavior and resume again.
- [ ] Confirm janitor does not break active sessions.

---

## 14. Risk Register and Mitigation

### R1: Behavior regressions in sandbox execution
- Mitigation:
  - [ ] keep smoke tests after each major sandbox edit
  - [ ] keep explicit logs on failure boundaries

### R2: Over-aggressive lint policy changes
- Mitigation:
  - [ ] document every relaxed rule
  - [ ] no global disable of correctness category

### R3: Type migration causing circular deps
- Mitigation:
  - [ ] domain type files, no barrel dumping everything
  - [ ] prefer explicit imports over broad re-export chains

---

## 15. Final Release Checklist

- [ ] Branch rebased on latest `main`
- [ ] `bun run typecheck` green
- [ ] `bun run check` green
- [ ] smoke tests complete
- [ ] docs updated
- [ ] dependency audit complete
- [ ] PR summary includes:
  - [ ] architecture delta
  - [ ] removed complexity points
  - [ ] behavior parity notes
  - [ ] known tradeoffs

---

## 16. Work Tracking Board (Mark Progress Inline)

### Phase A: Foundation
- [ ] A1 branch setup
- [ ] A2 baseline checks
- [ ] A3 baseline behavior capture

### Phase B: Types
- [ ] B1 inventory
- [ ] B2 canonicalization
- [ ] B3 migration complete

### Phase C: Sandbox
- [ ] C1 lifecycle cleanup
- [ ] C2 timeout policy
- [ ] C3 showFile reliability
- [ ] C4 RPC cleanup

### Phase D: AI + Slack
- [ ] D1 orchestration simplification
- [ ] D2 slack ingress cleanup

### Phase E: Config + Deps + Lint
- [ ] E1 config/env cleanup
- [ ] E2 dependency cleanup
- [ ] E3 biome policy update

### Phase F: Docs + Release
- [ ] F1 docs complete
- [ ] F2 smoke complete
- [ ] F3 final PR ready
