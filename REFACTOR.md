# Gorkie Sandbox Refactor (Deep Plan)

## Executive Summary
This refactor should proceed, but with corrected assumptions.

The original plan is directionally right (replace custom sandbox agent stack), but it has several dangerous inaccuracies:
1. Signed Daytona preview URLs are ephemeral and should not be treated as durable identity.
2. `sandbox-agent` OpenCode compatibility is useful but explicitly experimental.
3. Session persistence behavior differs depending on whether you use:
   - native `sandbox-agent` TypeScript SDK sessions, or
   - OpenCode-compatible HTTP sessions under `/opencode/*`.
4. Session recovery must handle four independent failures: sandbox missing, sandbox stopped, agent server down, logical session missing.

This document replaces the earlier plan with a production-safe design.

---

## Scope
Replace all custom sandbox subagent infrastructure in `gorkie-slack` with Daytona sandboxes running `sandbox-agent` + OpenCode runtime behavior.

### Out of scope
- Replacing Redis rate limiting.
- Building user-facing sandbox admin UI.
- Multi-region cross-provider sandbox failover.

---

## Source-backed Findings

### A) `opencord` (reference app)
Key files reviewed:
- `opencord/src/sandbox/manager.ts`
- `opencord/src/sandbox/opencode-client.ts`
- `opencord/src/sessions/store.ts`
- `opencord/src/db/init.ts`

Important patterns:
1. Strong session status model (`creating/active/pausing/paused/resuming/destroyed/error`).
2. Persisted `resume_fail_count`, `last_error`, health/activity timestamps.
3. Session reattach logic when session ID is missing:
   - check by ID
   - try title-based reuse
   - else create replacement.
4. Per-thread in-process lock to prevent concurrent duplicate creates.

Takeaway for Gorkie:
- Keep the status/resume model.
- Keep per-thread lock logic.
- Keep title-based session recovery as fallback.

### B) `serverbox` (overkill but useful ideas)
Key files reviewed:
- `serverbox/packages/sdk/src/serverbox.ts`
- `serverbox/packages/sdk/src/sandbox/bootstrap.ts`
- `serverbox/packages/proxy/src/auto-resume.ts`
- `serverbox/packages/core/src/store/sqlite.ts`

Important patterns:
1. Auto-resume coordinator with in-flight dedupe.
2. Adapter around Daytona SDK API variation (`getPreviewLink` vs `getPreviewUrl`).
3. Structured error taxonomy.
4. Reverse-proxy model strips auth headers and injects server-side auth.

Takeaway for Gorkie:
- Borrow resume dedupe concept.
- Add Daytona preview API compatibility wrapper.
- Keep error codes structured.
- Do not adopt proxy architecture now (too heavy).

### C) `sandbox-agent` (runtime we are adopting)
Key docs and source reviewed:
- `sandbox-agent/docs/deploy/daytona.mdx`
- `sandbox-agent/docs/sdk-overview.mdx`
- `sandbox-agent/docs/session-persistence.mdx`
- `sandbox-agent/docs/session-restoration.mdx`
- `sandbox-agent/docs/opencode-compatibility.mdx`
- `sandbox-agent/server/packages/sandbox-agent/src/router.rs`
- `sandbox-agent/server/packages/opencode-adapter/src/lib.rs`

Confirmed facts:
1. Stable control plane is `/v1/*` (`/v1/health`, `/v1/fs/*`, etc).
2. OpenCode compatibility is mounted under `/opencode/*`.
3. OpenCode compatibility is documented as experimental.
4. OpenCode compat layer can persist metadata via sqlite when `OPENCODE_COMPAT_DB_PATH` is set.
5. Auth token is optional but available (`--token` + bearer auth).

Takeaway for Gorkie:
- Treat `/v1/*` as primary stable surface.
- Treat `/opencode/*` as optional adapter, not hard dependency.

### D) Daytona SDK behavior
Confirmed from installed SDK and docs:
- `sandbox.getSignedPreviewUrl(port, expiresInSeconds)` exists.
- `sandbox.getPreviewLink(port)` exists.
- `sandbox.process.executeCommand(command, cwd?, env?, timeout?)` supports process-level env injection.

Takeaway for Gorkie:
- Regenerate preview URL on demand.
- Use process env for provider key injection.

---

## Corrected Architecture

```text
Slack thread key (channel + thread_ts, or dm:user)
  -> Postgres row (sandbox_sessions)
    -> Daytona sandbox (sandbox_id)
      -> sandbox-agent process on port 3000
        -> native sandbox-agent session (preferred)
        -> optional opencode-compat session (/opencode/*)
```

### Thread key reality in Gorkie
Current `getContextId` behavior:
- Channel thread: `<channel>:<thread_ts>`
- DM: `dm:<user_id>`

Implication:
- One sandbox per DM user (across all DM messages).
- One sandbox per channel thread.

---

## Decision: Native SDK vs OpenCode-compat

### Recommended for production: Native `sandbox-agent` SDK
Use:
- `SandboxAgent.connect({ baseUrl, token? })`
- `sdk.getHealth()`
- `sdk.createSession(...)` / `sdk.resumeSession(...)`
- `session.prompt(...)`
- `sdk.writeFsFile(...)` / `sdk.listFsEntries(...)`

Why:
- Better API stability.
- Clear restore semantics in SDK docs.
- Avoid coupling to compat edge cases.

### Optional mode: OpenCode-compat HTTP (`/opencode/*`)
Use only if you need OpenCode SDK parity.

Hard requirements if used:
- Base path must include `/opencode`.
- Health for compat server semantics is `/opencode/global/health`.
- Configure persistent `OPENCODE_COMPAT_DB_PATH`.

---

## Data Model (Final)

Use Drizzle + Postgres (Neon). Keep one authoritative row per thread key.

### Table: `sandbox_sessions`

```ts
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    channelId: text('channel_id').notNull(),

    sandboxId: text('sandbox_id').notNull(),

    // Native SDK local session id OR compat session id, based on mode
    sessionId: text('session_id').notNull(),

    // 'native' | 'opencode_compat'
    sessionMode: text('session_mode').notNull().default('native'),

    // Cached preview info; not identity
    previewUrl: text('preview_url'),
    previewToken: text('preview_token'),
    previewExpiresAt: timestamp('preview_expires_at', { withTimezone: true }),

    status: text('status').notNull().default('creating'),
    lastError: text('last_error'),
    resumeFailCount: integer('resume_fail_count').notNull().default(0),

    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHealthOkAt: timestamp('last_health_ok_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusActivityIdx: index('sandbox_sessions_status_activity_idx').on(
      table.status,
      table.lastActivityAt
    ),
    pausedIdx: index('sandbox_sessions_paused_idx').on(table.pausedAt),
    updatedIdx: index('sandbox_sessions_updated_idx').on(table.updatedAt),
  })
);
```

### Status enum (string-constrained in app logic)
- `creating`
- `active`
- `resuming`
- `paused`
- `destroyed`
- `error`

### Why not store only `baseUrl`
Because signed preview URLs expire. `sandboxId` is the durable lookup key.

---

## Security Design

### Provider key handling
Use dedicated key:
- `SANDBOX_OPENROUTER_API_KEY`

Do:
- Pass it only to `sandbox.process.executeCommand(..., env)` when launching `sandbox-agent`.
- Keep it out of sandbox `envVars` at create time.
- Keep it out of files (`auth.json` not required for this plan).

Example launch:

```ts
await sandbox.process.executeCommand(
  'nohup sandbox-agent server --host 0.0.0.0 --port 3000 >/tmp/sandbox-agent.log 2>&1 &',
  '/home/daytona',
  { OPENROUTER_API_KEY: env.SANDBOX_OPENROUTER_API_KEY }
);
```

Residual risk:
- Shell users can potentially inspect process env via `/proc`.

Mitigations:
1. Separate scoped key.
2. Strict model allowlist.
3. Low spend + RPM/TPM caps.
4. Automated rotation.
5. Audit alerts for abnormal usage.

### `sandbox-agent` auth token
For defense in depth, run with token:

```bash
sandbox-agent server --token "$SANDBOX_AGENT_TOKEN" --host 0.0.0.0 --port 3000
```

Store `SANDBOX_AGENT_TOKEN` in DB row only if needed for reconnect, or regenerate on each boot and keep process-local in resolver execution context.

---

## Lifecycle State Machine

### `resolveSession(context)`

1. Derive `threadId` from `getContextId(context)`.
2. Acquire per-thread mutex in process.
3. Acquire DB coordination lock (advisory lock by thread hash) for multi-replica safety.
4. Lookup existing row.
5. If row exists:
   - Load sandbox by `sandboxId`.
   - If missing: mark `destroyed`, continue create.
   - If stopped: start sandbox.
   - Refresh preview URL/token (never trust stale URL).
   - Ensure server healthy (`/v1/health`).
   - If unhealthy: restart server process and retry health.
   - Ensure logical session exists:
     - native mode: `sdk.resumeSession(sessionId)`; if missing, create replacement.
     - compat mode: `GET /opencode/session/{id}`; if missing, recreate and update.
   - Mark `active`, update timestamps.
   - Return handles.
6. Create new path:
   - `daytona.create({ image: getSandboxImage(), autoStopInterval: 15 })`
   - write `opencode.json` and prompt file.
   - start `sandbox-agent` with process-level key.
   - fetch preview URL.
   - wait health.
   - create logical session.
   - insert row as `active`.

### `sendPrompt(...)`
1. `resolveSession`.
2. Sync attachments to sandbox filesystem.
3. Send prompt.
4. Mark activity.
5. Upload `output/display/*` artifacts to Slack.
6. Return summary + uploaded files.

### `stopSandbox(context)`
- Mark `paused` + `pausedAt`.
- Do not delete row.
- Daytona auto-stop handles VM.

---

## Failure Matrix and Recovery

| Failure | Detection | Recovery | DB update |
|---|---|---|---|
| Sandbox not found | Daytona `get` fails | recreate sandbox + session | `status=destroyed` then upsert new active row |
| Sandbox stopped | sandbox state | `sandbox.start()` then health check | `status=resuming` -> `active` |
| Agent server down | `/v1/health` fails | restart process + poll health | increment `resumeFailCount` on retries |
| Session missing | resume/get session fails | create replacement session id | update `sessionId`, `status=active` |
| Preview URL expired | network/401/404 through preview | regenerate preview URL/token | refresh preview columns |

Retry policy:
- health polling every 2s
- hard timeout 60s
- one automatic prompt retry after successful rehydrate

---

## Integration Mode Details

### Native mode details
- Health: `sdk.getHealth()` (`/v1/health`)
- Session create: `sdk.createSession({ agent: 'opencode', sessionInit: { cwd: '/home/daytona', mcpServers: [] } })`
- Session restore: `sdk.resumeSession(sessionId)`
- Prompt: `session.prompt([{ type: 'text', text: task }])`

### Compat mode details
- Base path must be `/opencode`
- Create: `POST /opencode/session`
- Exists: `GET /opencode/session/{id}`
- Prompt: `POST /opencode/session/{id}/message`
- Health: `GET /opencode/global/health`
- Persist compatibility metadata via `OPENCODE_COMPAT_DB_PATH=/home/daytona/.cache/sandbox-agent/opencode-sessions.db`

---

## File Plan (Concrete)

### Add
- `server/db/index.ts`
- `server/db/schema.ts`
- `drizzle.config.ts`
- `server/lib/sandbox/image.ts`
- `server/lib/sandbox/client.ts` (if compat mode retained)
- `server/lib/sandbox/display.ts`
- `server/lib/sandbox/agent-prompt.md`

### Rewrite
- `server/lib/sandbox/session.ts`
- `server/lib/sandbox/queries.ts`
- `server/lib/sandbox/attachments.ts`
- `server/lib/ai/tools/chat/sandbox.ts`

### Update
- `server/env.ts`
- `server/config.ts`
- `server/lib/sandbox/index.ts`
- `server/lib/ai/agents/index.ts` (remove `sandboxAgent` export)
- `server/lib/kv.ts` (remove sandbox redis key helper)
- `server/slack/events/message-create/utils/respond.ts` (keep stop hook, new implementation)

### Delete
- `server/lib/ai/agents/sandbox-agent.ts`
- `server/lib/ai/tools/sandbox/bash.ts`
- `server/lib/ai/tools/sandbox/read.ts`
- `server/lib/ai/tools/sandbox/write.ts`
- `server/lib/ai/tools/sandbox/edit.ts`
- `server/lib/ai/tools/sandbox/glob.ts`
- `server/lib/ai/tools/sandbox/grep.ts`
- `server/lib/ai/tools/sandbox/show-file.ts`
- `server/lib/ai/prompts/sandbox/core.ts`
- `server/lib/ai/prompts/sandbox/environment.ts`
- `server/lib/ai/prompts/sandbox/context.ts`
- `server/lib/ai/prompts/sandbox/tools.ts`
- `server/lib/ai/prompts/sandbox/workflow.ts`
- `server/lib/ai/prompts/sandbox/examples.ts`
- `server/lib/ai/prompts/sandbox/index.ts`
- `server/lib/sandbox/command-utils.ts`
- `server/lib/sandbox/context.ts`
- `server/lib/sandbox/utils.ts`

---

## Dependencies

Add:
- `sandbox-agent`
- `drizzle-orm`
- `@neondatabase/serverless`

Dev add:
- `drizzle-kit`

Keep:
- `@daytonaio/sdk`
- Redis via Bun for rate limiting only

---

## Environment Variables

Add:
- `DATABASE_URL`
- `SANDBOX_OPENROUTER_API_KEY`
- `SANDBOX_AGENT_TOKEN` (recommended, optional)

Keep existing Daytona vars:
- `DAYTONA_API_KEY`
- `DAYTONA_API_URL` (optional)
- `DAYTONA_TARGET` (optional)

---

## Implementation Phases

### Phase 0: Guardrails first
1. Add feature flag `SANDBOX_RUNTIME_MODE=native|compat`.
2. Default to `native`.
3. Keep old code path behind temporary fallback flag until rollout complete.

### Phase 1: Persistence foundations
1. Add Drizzle + Neon wiring.
2. Create `sandbox_sessions` schema and migrate.
3. Implement typed queries and status transitions.

### Phase 2: Sandbox runtime core
1. Add Daytona image builder.
2. Implement preview URL refresh helper.
3. Implement server bootstrap + health wait.
4. Implement `resolveSession` state machine with locking.

### Phase 3: Tool integration
1. Rewrite chat sandbox tool to call new runtime.
2. Port attachment sync to `sdk.writeFsFile`.
3. Add display artifact upload flow.

### Phase 4: Remove legacy stack
1. Remove custom tools/prompts/agent infra.
2. Remove redis sandbox state usage.
3. Update exports and config.

### Phase 5: Validation and rollout
1. Run `bun run check`.
2. Manual Slack e2e tests:
   - first message create
   - follow-up reuse
   - restart and recover
   - expired preview and recover
3. Roll out behind flag and monitor logs.

---

## Observability and Runbooks

Add structured logs:
- `sandbox.resolve.start`
- `sandbox.resolve.reuse`
- `sandbox.resolve.recreate`
- `sandbox.health.retry`
- `sandbox.session.replaced`
- `sandbox.prompt.ok`
- `sandbox.prompt.recoverable_fail`
- `sandbox.prompt.fatal_fail`

Add counters:
- sandbox creates
- sandbox resumes
- session replacements
- health retries
- prompt retries

Runbook snippets:
- If frequent session replacement: inspect `OPENCODE_COMPAT_DB_PATH` and sandbox-agent restarts.
- If frequent health failures: inspect `/tmp/sandbox-agent.log` and Daytona network tier.
- If 401/403 on preview URL: regenerate signed URL immediately.

---

## Testing Strategy

There are no existing tests in this repo. Add minimum integration tests around query/lifecycle helpers.

Manual acceptance checklist:
1. New thread creates sandbox, responds.
2. Same thread reuses sandbox after multiple prompts.
3. Kill sandbox-agent process inside sandbox; next prompt recovers.
4. Stop sandbox manually; next prompt starts and reuses.
5. Force session missing; replacement created and thread continuity preserved.
6. Attachments upload to sandbox and are usable.
7. `output/display/*` files auto-upload to Slack.

---

## Rollback Plan

Keep temporary runtime flag for one release window:
- `legacy` -> current custom stack
- `native` -> new stack default

If major regression:
1. flip env flag back to `legacy`
2. keep migrated DB table (non-breaking)
3. investigate using stored `lastError` and logs

---

## Open Decisions (Need explicit sign-off)

1. Final mode default:
   - `native` (recommended)
   - `compat` (only if strict OpenCode API parity is mandatory)
2. Whether to enforce `--token` for sandbox-agent server.
3. Whether to add DB advisory locks now or defer until multi-replica deployment.
4. DM mapping behavior:
   - keep one sandbox per user DM
   - or isolate by DM thread key equivalent

---

## Reference Links

Primary sources:
- https://github.com/rivet-dev/sandbox-agent
- https://github.com/R44VC0RP/opencord
- https://github.com/R44VC0RP/serverbox

Docs:
- https://sandboxagent.dev/docs/deploy/daytona
- https://sandboxagent.dev/docs/sdk-overview
- https://sandboxagent.dev/docs/session-persistence
- https://sandboxagent.dev/docs/session-restoration
- https://sandboxagent.dev/docs/opencode-compatibility
- https://www.daytona.io/docs/llms.txt
- https://orm.drizzle.team/llms.txt
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/providers/openrouter/

Local source checkpoints reviewed:
- `opencord/src/sandbox/manager.ts`
- `opencord/src/sessions/store.ts`
- `opencord/src/db/init.ts`
- `serverbox/packages/sdk/src/serverbox.ts`
- `serverbox/packages/proxy/src/auto-resume.ts`
- `sandbox-agent/server/packages/sandbox-agent/src/router.rs`
- `sandbox-agent/server/packages/opencode-adapter/src/lib.rs`
- `sandbox-agent/sdks/typescript/src/client.ts`
