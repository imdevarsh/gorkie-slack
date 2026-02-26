# Product Requirements Document: Gorkie Migration to Vercel Chat SDK

Date: 2026-02-25  
Status: Ready for implementation  
Owner: Gorkie Slack maintainers  
Primary Stakeholders: Platform, AI orchestration, and Slack operations  

## 1. Executive Summary

Gorkie currently relies on Slack Bolt event handling plus custom Slack-specific plumbing. This PRD defines a full migration to Vercel Chat SDK (`chat`) as the runtime orchestration layer while preserving user-facing bot behavior and existing AI tool capabilities.

The migration goal is to reduce bespoke event infrastructure, improve reliability of thread subscription/locking, and simplify future evolution of the bot architecture.

## 2. Problem Statement

The current stack has high coupling to Bolt internals and Slack-specific context types. Core concerns like thread routing, subscription state, streaming lifecycle, and event filtering are implemented in multiple places.

Current pain points:

- Event lifecycle is spread across `server/slack/*` handlers and utility layers.
- `SlackMessageContext` is deeply coupled into AI tools and orchestration paths.
- Stream/status behavior depends on custom wrappers over Slack APIs.
- Concurrency protections are partially custom and harder to reason about at thread scope.
- Maintenance cost increases for every behavior change.

## 3. Goals

1. Replace Bolt runtime/event path with Chat SDK (`Chat`, adapters, state, handlers).
2. Preserve functional parity for mentions, DMs, and thread continuity.
3. Keep existing AI orchestration strategy (Vercel AI SDK + tool loop) with minimal behavior drift.
4. Improve operational reliability (distributed locks, clean lifecycle, structured logging).
5. Reduce code complexity by removing redundant Slack event plumbing.

## 4. Non-Goals

1. Multi-platform rollout (Teams/Discord/etc.) in this phase.
2. Prompt strategy redesign unrelated to runtime migration.
3. Major redesign of business logic inside existing tools.
4. Backward compatibility with the old runtime path after cutover.

## 5. Users and Core Journeys

### 5.1 End Users

- Slack workspace members interacting with Gorkie via mentions, DMs, and thread replies.

### 5.2 Operators

- Maintainers managing env configuration, deploy lifecycle, and production logs.

### 5.3 Critical User Journeys

1. Mention bot in channel -> bot replies in thread and continues conversation.
2. DM bot -> bot responds and follows subsequent DM messages.
3. Reply in subscribed thread -> bot processes continuation without re-mention.
4. Use tool-enabled workflows (search, summarize, reactions, file/sandbox workflows).
5. Receive robust failure behavior (error-safe response/logging, no duplicate spam).

## 6. In Scope

- Chat SDK core runtime integration.
- Slack adapter + Redis state adapter setup.
- Handler migration (`onNewMention`, `onSubscribedMessage`, optional others currently used).
- Context model migration away from `SlackMessageContext`.
- AI tool contract updates where context is required.
- Legacy Bolt path removal after parity validation.
- Documentation and environment schema updates.

## 7. Out of Scope

- New product features unrelated to migration.
- New Slack UX primitives not already in use (e.g., broad cards/modal expansion).
- Automated E2E test framework build-out (manual matrix only for this PRD).

## 8. Functional Requirements

### FR-1 Runtime Boot

- System must initialize a single `Chat` instance with Slack adapter.
- System must register required handlers before serving traffic.
- System must support graceful shutdown using runtime lifecycle hooks.

### FR-2 Webhook Handling

- Slack event HTTP route must be served via `bot.webhooks.slack(request)`.
- Socket-mode-only assumptions must be removed from production path.

### FR-3 Message Routing

- `onNewMention` must subscribe thread and invoke orchestrator.
- `onSubscribedMessage` must handle continued thread messages.
- DM behavior must remain equivalent to current expected behavior.

### FR-4 Context Abstraction

- Replace `SlackMessageContext` usage in runtime path with a Chat SDK-oriented context object.
- Context must expose thread/message identifiers and adapter access as needed.

### FR-5 Tool Execution

- Existing tool modules must remain callable from orchestrator under new context.
- Tools requiring Slack raw APIs may use explicit adapter escape hatches.

### FR-6 Streaming and Response Delivery

- Streaming responses must use Chat SDK thread posting semantics.
- Bot must avoid duplicate message emissions per source event.

### FR-7 Permissions and Access Controls

- Existing opt-in/allowed-user behavior must be preserved.
- Cache refresh logic must not depend on Bolt app lifecycle.

### FR-8 Observability

- Structured logs must include team/channel/thread/message IDs where available.
- Error logs must preserve actionable context and stack details.

## 9. Non-Functional Requirements

### NFR-1 Reliability

- No increase in failed response rate versus baseline during rollout period.

### NFR-2 Concurrency Safety

- Thread-level processing must use Chat SDK distributed locking/state.

### NFR-3 Maintainability

- Legacy event plumbing in `server/slack/events/*` removed from active runtime.

### NFR-4 Performance

- Message processing latency should remain within current operational expectations.

### NFR-5 Security

- Existing SFW and permission guardrails must remain enforced.

## 10. Technical Design Decisions

1. Chat SDK is the canonical runtime entry point.
2. Slack adapter (`@chat-adapter/slack`) is the sole Slack integration boundary.
3. Redis state adapter is production default; in-memory state allowed only for local dev fallback.
4. AI orchestrator remains in place; only runtime/context interfaces are migrated.
5. No dual-runtime long term; Bolt path is removed after cutover validation.

## 11. Work Breakdown Structure (Detailed Tasks)

## Phase 0: Baseline and Preparation

### Tasks

- [ ] Capture behavior baseline matrix from current runtime:
  - mention in channel
  - DM start and follow-up
  - thread follow-up after mention
  - unauthorized user path
  - file-attached input path
- [ ] Add required dependencies:
  - `chat`
  - `@chat-adapter/slack`
  - `@chat-adapter/state-redis`
  - `@chat-adapter/state-memory` (dev fallback)
- [ ] Validate and update `server/env.ts` schema for migration needs.
- [ ] Define rollout feature flag strategy (temporary only).

### Exit Criteria

- Baseline behavior documented.
- Dependencies installed and typecheck passes.
- Env contract updated.

## Phase 1: Runtime Skeleton

### Tasks

- [ ] Create `server/chat/bot.ts`:
  - instantiate `Chat`
  - wire Slack adapter
  - wire state adapter
  - register placeholder handlers
- [ ] Update `server/index.ts` startup path to use Chat SDK webhook route.
- [ ] Implement graceful shutdown path calling `bot.shutdown()`.
- [ ] Confirm local smoke flow for Slack webhook handshake/events.

### Exit Criteria

- Application starts with Chat SDK runtime.
- Slack webhook endpoint responds correctly.

## Phase 2: Core Event Migration

### Tasks

- [ ] Implement `onNewMention` to subscribe + orchestrate reply flow.
- [ ] Implement `onSubscribedMessage` for continued thread processing.
- [ ] Add DM behavior parity handling.
- [ ] Remove redundant trigger checks now covered by Chat SDK event model.
- [ ] Preserve bot/self-message guard logic.

### Exit Criteria

- Mention, DM, and subscribed-thread flows working in dev/staging.

## Phase 3: Context and Tool Refactor

### Tasks

- [ ] Add `server/types/chat-runtime.ts` with canonical context shape.
- [ ] Migrate orchestrator context intake to Chat SDK context.
- [ ] Refactor tool factories that currently require `SlackMessageContext`.
- [ ] Add adapter helper layer for tools that still need Slack raw client access.
- [ ] Update prompt/context builder utilities to new thread/message model.

### Exit Criteria

- No runtime path depends on `SlackMessageContext`.
- Orchestrator and tools compile and execute under new context.

## Phase 4: Permissions, Queueing, and Auxiliary Systems

### Tasks

- [ ] Refactor `allowed-users` cache update path to remove Bolt app dependency.
- [ ] Revalidate queueing requirements and remove unnecessary custom serialization.
- [ ] Map status/typing/assistant-state logic onto Chat SDK-compatible APIs.
- [ ] Audit direct `context.client.*` calls and migrate or isolate them.

### Exit Criteria

- Permissions parity confirmed.
- Concurrency behavior validated with no duplicate processing.

## Phase 5: Cutover and Cleanup

### Tasks

- [ ] Remove legacy Bolt runtime files from active code path.
- [ ] Delete deprecated Slack event handlers and dead utilities.
- [ ] Update README and operational docs.
- [ ] Run lint and type checks.
- [ ] Execute manual validation matrix and log results.

### Exit Criteria

- Chat SDK-only runtime in main path.
- Documentation reflects new architecture.

## 12. File-Level Implementation Plan

### New Files

- `server/chat/bot.ts`
- `server/chat/handlers/*` (if split for readability)
- `server/types/chat-runtime.ts`

### Major Modifications

- `server/index.ts`
- `server/env.ts`
- `server/lib/allowed-users.ts`
- `server/lib/ai/agents/orchestrator.ts`
- `server/lib/ai/tools/**` (context-dependent tools)
- `server/utils/context.ts`
- `server/utils/triggers.ts`
- `server/lib/ai/utils/stream.ts`
- `server/lib/ai/utils/status.ts`

### Removals After Cutover

- `server/slack/app.ts`
- `server/slack/events/*` (legacy Bolt path)
- Any dead type/util files only used by removed Bolt runtime

## 13. Acceptance Criteria

1. Mention, DM, and subscribed-thread flows function correctly under Chat SDK runtime.
2. Core tools execute successfully with migrated context contracts.
3. No duplicate bot responses for a single incoming user message.
4. Opt-in/permission behavior remains correct.
5. Structured logs contain traceable thread/channel/message identifiers.
6. Legacy Bolt event pipeline is removed from production execution path.

## 14. Validation Plan

### Automated Gates

- `bun run check`
- `bun run lint`
- `bun run typecheck` (if available in scripts)

### Manual Test Matrix

- [ ] Mention in channel
- [ ] DM start
- [ ] DM follow-up
- [ ] Thread follow-up after mention
- [ ] Unauthorized user handling
- [ ] File/image attachment path
- [ ] Tool actions (`reply`, `react`, search/summarize/sandbox-related paths)
- [ ] Upstream API failure handling and log quality

### Observability Checks

- [ ] Verify IDs in logs (team/channel/thread/message)
- [ ] Verify no duplicate outputs on retries/replays

## 15. Rollout Plan

1. Deploy behind temporary runtime flag in staging.
2. Validate full matrix and monitor logs.
3. Promote Chat SDK path to production default.
4. Remove fallback path once stable.
5. Remove Bolt dependencies and dead code in cleanup PR.

## 16. Risks and Mitigations

1. Risk: Trigger behavior drift.
Mitigation: Baseline matrix and explicit parity checks.

2. Risk: Tool regressions from context migration.
Mitigation: Incremental tool migration with compile-time typing and staged validation.

3. Risk: Duplicate responses under concurrency.
Mitigation: Rely on Chat SDK state + lock semantics and verify in staging.

4. Risk: Permission cache regressions.
Mitigation: Add deterministic refresh path and conservative access defaults.

5. Risk: Hidden direct Slack API dependencies.
Mitigation: Codebase audit and adapter-escape encapsulation.

## 17. Definition of Done

- Chat SDK runtime fully replaces Bolt runtime for message/event handling.
- Functional parity achieved for all critical user journeys.
- All context-dependent tooling migrated and operational.
- Legacy runtime files removed from production path.
- Docs and env contracts updated and accurate.
- Manual validation matrix completed and recorded.
