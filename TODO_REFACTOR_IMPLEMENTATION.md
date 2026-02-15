# Sandbox Refactor Implementation TODO (Context-Safe)

## Always-Do First (Before Any Work)
1. Read `REFACTOR.md` fully.
2. Read `~/.claude/conventions`.
3. Read `~/.claude/AGENTS.md`.
4. Confirm locked decisions:
   - native `sandbox-agent` only
   - token required
   - advisory locks enabled
   - one sandbox per DM user
   - lifecycle: stop 5m, archive 60m, delete 2d

## Phase 0: Baseline and Safety
1. Record current git status and branch.
2. Confirm no destructive git commands will be used.
3. Ensure references (`opencord`, `serverbox`, `sandbox-agent`) are treated as read-only research dirs.
4. Ensure any project checks ignore cloned reference dirs when needed.

## Phase 1: Dependencies and Environment
1. Add runtime deps:
   - `sandbox-agent`
   - `drizzle-orm`
   - `@neondatabase/serverless`
2. Add dev dep:
   - `drizzle-kit`
3. Update `server/env.ts`:
   - add `DATABASE_URL`
   - add `SANDBOX_HACKCLUB_API_KEY`
   - add `SANDBOX_AGENT_TOKEN`
4. Update `.env.example` with new variables and comments.

## Phase 2: Database Foundation
1. Add `server/db/index.ts` (Drizzle client).
2. Add `server/db/schema.ts` with `sandbox_sessions`.
3. Add `drizzle.config.ts` in repo root.
4. Add migration workflow docs/comments for `drizzle-kit`.
5. Create migration and apply (or document manual apply path).
6. Verify table and indexes exist.

## Phase 3: Config and Runtime Policy
1. Ensure `server/config.ts` has:
   - `autoStopMinutes: 5`
   - `autoArchiveMinutes: 60`
   - `autoDeleteMinutes: 2 * 24 * 60`
2. Add comment noting bump to 7 days if needed.
3. Ensure sandbox create path uses all three intervals.
4. Ensure existing config consumers still compile.

## Phase 4: Sandbox Core Rewrite
1. Add `server/lib/sandbox/image.ts` (prebuilt image commands).
2. Add `server/lib/sandbox/prompt.md`.
3. Rewrite `server/lib/sandbox/queries.ts` for Drizzle:
   - getByThread
   - upsert
   - updateStatus
   - markActivity
4. Add advisory-lock helper for thread-level DB lock.
5. Rewrite `server/lib/sandbox/session.ts`:
   - resolveSession(context)
   - reconnect logic by sandboxId
   - preview URL refresh logic
   - health wait (`/v1/health`)
   - server bootstrap with token + Hack Club key env
   - native SDK session create/resume
   - replacement session if missing
   - stopSandbox(context)
6. Ensure no title-based recovery logic exists.

## Phase 5: Filesystem/Attachments/Artifacts
1. Rewrite `server/lib/sandbox/attachments.ts` to use `sdk.writeFsFile`.
2. Add `server/lib/sandbox/display.ts`:
   - list `output/display/`
   - upload files to Slack
3. Ensure file size and filename sanitization rules remain.

## Phase 6: Tool Integration
1. Rewrite `server/lib/ai/tools/chat/sandbox.ts`:
   - resolve session
   - sync attachments
   - send prompt
   - upload display artifacts
2. Return structured success/error payload.
3. Keep robust logging around failure points.

## Phase 7: Remove Legacy Custom Agent Stack
1. Delete `server/lib/ai/agents/sandbox-agent.ts`.
2. Delete all `server/lib/ai/tools/sandbox/*`.
3. Delete all `server/lib/ai/prompts/sandbox/*`.
4. Delete `server/lib/sandbox/command-utils.ts`.
5. Delete `server/lib/sandbox/context.ts`.
6. Delete `server/lib/sandbox/utils.ts`.
7. Update imports/exports to remove deleted references.

## Phase 8: Integration Points and Cleanup
1. Update `server/lib/sandbox/index.ts` exports.
2. Update `server/lib/ai/agents/index.ts` (remove `sandboxAgent` export).
3. Update `server/lib/kv.ts` (remove sandbox redis key).
4. Update `server/slack/events/message-create/utils/respond.ts` if needed.
5. Ensure orchestrator still calls chat sandbox tool correctly.

## Phase 9: Validation
1. `bun run typecheck`.
2. `bun run check` (or project-scoped check excluding reference repos if necessary).
3. Validate app startup.
4. Manual behavior checks:
   - new thread create
   - same thread resume
   - stop/start resume
   - session missing replacement
   - attachment sync
   - display uploads

## Phase 10: Hardening and Documentation
1. Add logs for resolve/create/reuse/recovery paths.
2. Document operational runbook in `REFACTOR.md` or README section.
3. Document required env vars and security notes.
4. Confirm token enforcement everywhere.
5. Confirm key never written to sandbox files.

## Completion Criteria
1. No legacy sandbox custom agent code remains.
2. Native sandbox-agent path works end-to-end.
3. DB-backed session mapping is source of truth.
4. Lifecycle policy is enforced (5m/60m/2d).
5. Build/check/typecheck pass for project code.
