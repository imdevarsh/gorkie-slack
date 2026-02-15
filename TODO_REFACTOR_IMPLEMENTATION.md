# E2B Refactor Master TODO (Hard Cut, No Legacy)

## Execution Rules
1. E2B is the only sandbox backend.
2. No compatibility paths, feature flags, or fallback behavior for Daytona/sandbox-agent/OpenCode.
3. Delete old implementation modules instead of preserving dead abstractions.
4. Keep the main-branch orchestration shape: orchestrator -> chat sandbox tool -> sandbox execution agent -> typed tools -> sandbox.
5. Preserve security boundaries: no provider keys or Slack bot token inside sandbox runtime/files.
6. Every phase must end with a verification command before moving to the next phase.

## Phase 0: Preflight and Baseline Capture
1. Confirm all refactor docs are aligned: `REFACTOR.md`, `MAIN_BRANCH_SANDBOX_INVESTIGATION.md`, `TODO.md`, this file.
2. Confirm current dependency graph and references:
3. Run `rg -n "@daytonaio/sdk|sandbox-agent|opencode|sessionUpdate|preview token|Daytona|OpenCode" server package.json`.
4. Capture current compile baseline:
5. Run `bun x tsc --noEmit` and save output snapshot.
6. Capture current lint baseline:
7. Run `bun run lint` and save output snapshot.
8. Capture current sandbox DB schema baseline:
9. Dump relevant schema/query files before edits.
10. Acceptance criteria: baseline artifacts collected and known failing points documented.

## Phase 1: Dependency and Config Hard Cut
1. Remove legacy dependencies from `package.json` and lockfile:
2. Ensure `@daytonaio/sdk` and `sandbox-agent` are absent.
3. Keep/add only E2B SDK dependency path (`@e2b/code-interpreter` and required transitive package).
4. Remove legacy env vars from validation and docs:
5. Delete `DAYTONA_*` and any old agent transport env keys not used by E2B path.
6. Add/validate E2B env keys (`E2B_API_KEY`, optional `E2B_TEMPLATE`).
7. Rewrite sandbox config to E2B-first fields only:
8. Remove `agentPort`, preview URL/token settings, legacy health-check intervals, and snapshot config fields tied to Daytona stack.
9. Keep only runtime values needed for E2B lifecycle, paths, timeouts, upload constraints.
10. Acceptance criteria: zero legacy dependency imports compile-time reachable from server runtime.

## Phase 2: Database Schema and Query Rewrite
1. Finalize `sandbox_sessions` schema for E2B lifecycle:
2. Required fields: `thread_id`, `channel_id`, `sandbox_id`, `status`, `last_error`, `created_at`, `updated_at`, `paused_at`, `resumed_at`, `destroyed_at`.
3. Remove deprecated fields and all session transport identifiers (`session_id`, preview metadata, OpenCode transport fields).
4. Rewrite query layer around lifecycle transitions only:
5. `getByThread`, `upsert`, `updateStatus`, `markActivity`, `clearDestroyed`.
6. Ensure `updateStatus` can record `last_error` and lifecycle timestamps deterministically.
7. Validate callers are updated to new query signatures.
8. Acceptance criteria: DB query module has no unused legacy operations and no references to transport/session identifiers.

## Phase 3: Delete Legacy Sandbox Stack Modules
1. Remove or replace all legacy files under `server/lib/sandbox` tied to Daytona/sandbox-agent/OpenCode:
2. `client.ts`, `runtime.ts`, `session.ts`, `events.ts`, `snapshot.ts`, `config.ts`.
3. Keep only E2B-native modules with clear single responsibility.
4. Remove all imports of removed modules and replace call sites.
5. Delete dead exports from `server/lib/sandbox/index.ts`.
6. Run `rg -n "resolveSession|subscribeEvents|getResponse|createSnapshot|preview|sandbox-agent|session/prompt|session/update" server` and ensure no runtime references remain.
7. Acceptance criteria: no file in `server/lib/sandbox` references Daytona/sandbox-agent/OpenCode APIs.

## Phase 4: Build New E2B Runtime Layer
1. Create/replace runtime module for E2B lifecycle management.
2. Implement `ensureSandbox(context)` behavior:
3. Lookup thread mapping in DB.
4. Attempt `Sandbox.connect(sandboxId)` for active/resuming state.
5. On missing/invalid sandbox, create new `Sandbox.create(...)` and update DB.
6. Implement `pauseSandbox` and `destroySandbox` semantics where required by app logic.
7. Implement idempotent startup behavior:
8. Never kill/restart sandbox unnecessarily.
9. Avoid destructive actions unless explicitly requested by lifecycle logic.
10. Apply strict timeout settings via E2B APIs.
11. Add structured logs for create/reuse/reconnect/fail/cleanup transitions.
12. Acceptance criteria: repeated calls in same thread reuse sandbox consistently and do not recreate unless connection truly fails.

## Phase 5: Attachments and Output Artifact Pipeline
1. Rewrite attachment sync against E2B filesystem APIs.
2. Canonical attachment path: `/home/daytona/attachments`.
3. Enforce size limits and sanitize file names.
4. Preserve MIME metadata where useful for prompt resource hints.
5. Rewrite display upload flow:
6. Canonical display path: `/home/daytona/output/display`.
7. Enumerate files, upload to Slack thread, and then delete only uploaded display copies.
8. Keep original artifacts in `/home/daytona/output` when staging with `cp` from prompt contract.
9. Add resilient upload logging with per-file success/failure status.
10. Acceptance criteria: user-visible files are uploaded only from display dir, and display dir cleanup is deterministic.

## Phase 6: Sandbox Tooling (Typed, Minimal, Deterministic)
1. Implement typed sandbox execution tools used by sandbox execution agent:
2. `runCommand` with timeout, cwd, env allowlist, structured stdout/stderr/exitCode/duration.
3. `readFile` for files/directories with preview truncation policy.
4. `writeFile` and `editFile` with safe path handling.
5. `globFiles` and `grepFiles` for deterministic workspace discovery.
6. `showFile` for explicit Slack artifact staging/upload intent.
7. Ensure each tool has consistent result envelope and error taxonomy.
8. Instrument each tool execution with structured logs (tool name, sanitized input, status, duration, summary output).
9. Acceptance criteria: sandbox agent can complete file/code tasks using only typed tools with no hidden transport assumptions.

## Phase 7: Sandbox Execution Agent Rebuild
1. Add `server/lib/ai/agents/sandbox-agent.ts` as AI SDK tool-loop agent.
2. Keep bounded step count and deterministic stopping conditions.
3. Register only approved sandbox tools plus explicitly allowed shared tools.
4. Remove event-stream reconstruction logic entirely.
5. Return final response directly from AI SDK call result, not parsed chunks from transport updates.
6. Add per-run trace/log context linking thread, sandbox ID, model, and tool-call counts.
7. Acceptance criteria: no `sessionUpdate` parsing exists in execution path.

## Phase 8: Prompt System Rewrite for Sandbox Agent
1. Keep modular prompt files under `server/lib/ai/prompts/sandbox/`.
2. Rework sections: `core`, `environment`, `tools`, `workflow`, `examples`, `context`.
3. Enforce concise but strict rules:
4. absolute paths,
5. output directory contract,
6. display directory contract,
7. status text format: `is <doing something>` under 50 chars,
8. retry on recoverable command failures,
9. final response format with exact paths and actions.
10. Remove repetitive or contradictory prompt instructions.
11. Include examples that mirror expected behavior (copy to display, verify outputs, concise summary).
12. Acceptance criteria: prompt set is coherent, non-redundant, and operationally deterministic.

## Phase 9: Chat Sandbox Tool Rewrite
1. Rewrite `server/lib/ai/tools/chat/sandbox.ts` to new flow:
2. set high-level status,
3. ensure/reuse sandbox via E2B runtime,
4. sync attachments,
5. build sandbox request context,
6. execute sandbox agent,
7. upload display files,
8. return final response.
9. Remove references to legacy `resolveSession`, `subscribeEvents`, `getResponse`, OpenCode prompt transport.
10. Ensure status messages honor Slack loading message limits.
11. Acceptance criteria: one clean delegation call path with no transport parsing layers.

## Phase 10: Observability and Error Taxonomy
1. Standardize sandbox error codes:
2. create/connect timeout,
3. sandbox not found,
4. command timeout,
5. filesystem read/write failure,
6. attachment download failure,
7. upload failure,
8. model/tool-loop failure.
9. Add structured logs in all lifecycle and tool paths with `ctxId`, `threadId`, `sandboxId`, and `phase`.
10. Ensure sensitive fields are never logged (tokens/secrets/full binary blobs).
11. Add debug logs for response extraction in new path only where necessary.
12. Acceptance criteria: failure logs are actionable without noisy duplicate spam.

## Phase 11: Remove Dead Code and Simplify APIs
1. Delete unused helper functions and unused exports created by old architecture.
2. Shorten overlong function names where clarity is preserved.
3. Split overloaded modules into `runtime.ts`, `lifecycle.ts`, `tools.ts`, `uploads.ts` if needed.
4. Remove obsolete DB fields from application types and serializers.
5. Ensure no orphan prompt/context helper remains from old stack.
6. Acceptance criteria: `rg -n "TODO legacy|compat|fallback|daytona|sandbox-agent|opencode" server` shows no active runtime usage.

## Phase 12: Verification Matrix
1. Compile check: `bun x tsc --noEmit`.
2. Lint check: `bun run lint`.
3. Format check: `bun run format` (or `bun run fix` if needed).
4. Manual scenario A: image transform request with attachment and display upload.
5. Manual scenario B: code generation task with output file and display staging.
6. Manual scenario C: repeated thread follow-up to confirm sandbox reuse.
7. Manual scenario D: forced sandbox missing case to confirm recreate behavior.
8. Manual scenario E: command failure then retry path with meaningful final response.
9. Manual scenario F: upload failure path gracefully reported.
10. Acceptance criteria: all scenarios complete without legacy fallback and with deterministic status/response.

## Phase 13: Final Cleanup and Handoff
1. Update README/ops docs for E2B-only setup and env requirements.
2. Remove outdated references from internal docs and comments.
3. Summarize final architecture and migration notes in `REFACTOR.md` completion section.
4. Provide concise rollout note: this is a hard cut and requires E2B credentials.
5. Acceptance criteria: repository state is internally consistent and deployment-ready.

## Done Definition
1. Runtime contains zero Daytona/sandbox-agent/OpenCode transport code.
2. All sandbox execution is E2B-backed via typed tool-loop agent.
3. Prompt + tool contracts enforce deterministic output/display behavior.
4. DB/session model matches E2B lifecycle only.
5. Typecheck and lint pass.
6. Manual validation matrix passes on real Slack thread interactions.
