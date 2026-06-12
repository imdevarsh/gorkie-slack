# Plan 007: MCP connection-lifecycle logging + automatic ctxId correlation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/lib/mcp/connection.ts packages/logging/src apps/bot/src/lib/logger.ts apps/bot/src/slack/events/message-create`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (part B touches every log line via a pino mixin)
- **Depends on**: 001 (for the packages/logging unit test)
- **Category**: dx
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

Two observability gaps, one small and one structural:

**A — connection lifecycle is dark.** MCP *tool calls* are already
well-logged (`apps/bot/src/lib/mcp/wrapper.ts` logs `[mcp] Tool
started/completed/failed/blocked` with ctxId, duration, clamped input/output —
GOAL.md's "no MCP logging" note is stale on that point). But
`apps/bot/src/lib/mcp/connection.ts` — bearer connect, OAuth connect/finalize,
and the failure path that disables a server — contains **zero** logger calls.
When a server flips to disabled in production, the only trace is the DB
`lastError` column; there is nothing in the logs to correlate with.

**B — ctxId is hand-threaded.** `packages/logging` is already formatted for a
`ctxId` field (pino-pretty `messageFormat: '{if ctxId}[{ctxId}] {end}{msg}'`),
but every call site must pass it manually; any log emitted below a function
that wasn't handed `ctxId` loses correlation. `AsyncLocalStorage` + a pino
`mixin` makes correlation automatic for everything under a wrapped entry point.

## Current state

- `apps/bot/src/lib/mcp/connection.ts` (153 lines) — no logger import.
  Functions: `connectBearerServer` (fetch tools with raw token → encrypt+store
  → `finalizeSuccess`), `connectOAuthServer` (runs `auth(...)`; may return an
  authorize-redirect URL), `finalizeOAuthServer`, and private
  `finalizeSuccess`/`finalizeFailure`. `finalizeFailure` deletes connections
  and writes `enabled: false, lastError: errorMessage(error)` — silently.
- `apps/bot/src/lib/mcp/wrapper.ts` — the logging style to match:
  structured fields object first, message string `'[mcp] ...'` second, e.g.
  `logger.info({ ...logCtx, durationMs }, '[mcp] Tool completed')`; errors via
  `logger.error({ err: error, ... }, ...)`. The bot's logger is imported as
  `import logger from '@/lib/logger';`.
- `packages/logging/src/logger.ts` — `createLogger(...)` builds the pino
  instance (three branches: Vercel, dev pretty, prod file targets). The `base`
  options object (level, timestamp, serializers) is where a `mixin` belongs.
  `packages/logging/package.json` exports per-file paths (`./logger`, `./keys`,
  `./*`).
- `apps/bot/src/lib/logger.ts` — calls `createLogger` (read it to see the
  exact call before editing).
- ctxId derivation: `getContextId(context)` from `apps/bot/src/utils/context.ts`,
  used throughout `message-create` utils and `approval.ts`.
- Entry points that should establish the context:
  - `apps/bot/src/slack/events/message-create/index.ts` — the message event
    handler (read it to find where the context object first exists).
  - `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts` —
    `execute` builds `resumeContext` and computes
    `getContextId(resumeContext)` before enqueueing `resumeResponse`.
- The scheduled-task runner (`apps/bot/src/lib/tasks/runner.ts`) builds
  synthetic contexts — wrap `runTask` too if trivial, otherwise leave it
  (optional, note in report).
- Conventions: dict params; inline over extract; secrets must never be logged
  (raw bearer tokens flow through `connectBearerServer` — log lengths/ids,
  NEVER the token); Ultracite/Biome; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |
| Tests     | `bun run test`           | all pass, incl. new logging test |

## Scope

**In scope**:

- `apps/bot/src/lib/mcp/connection.ts` (add logging)
- `packages/logging/src/context.ts` (create), `packages/logging/src/logger.ts`
  (mixin), `packages/logging/src/index.ts` or package exports if needed
- `packages/logging/src/context.test.ts` (create)
- `apps/bot/src/slack/events/message-create/index.ts`,
  `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`
  (wrap entry points only)

**Out of scope** (do NOT touch):

- `wrapper.ts` — its explicit ctxId fields are fine; do not strip them.
- `oauth-provider.ts`, `remote.ts` (remote's single `'MCP server failed'`
  warn is sufficient there; plan 005 owns that file).
- `apps/server` — its logger (`apps/server/src/utils/logger.ts`) is separate;
  Nitro request correlation is a different problem.
- Langfuse/OTel tracing.

## Git workflow

- Branch: `advisor/007-mcp-observability`
- Two conventional commits:
  `feat: log MCP connection lifecycle events` and
  `feat: propagate ctxId to logs via AsyncLocalStorage mixin`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (Part A): Log the connection lifecycle

In `apps/bot/src/lib/mcp/connection.ts`, add
`import logger from '@/lib/logger';` and emit, matching wrapper.ts style:

- `finalizeSuccess`: `logger.info({ serverId, userId, toolCount: definitions.tools.length }, '[mcp] Server connected')`
- `finalizeFailure`: `logger.warn({ err: error, serverId, userId }, '[mcp] Server connection failed — disabling')`
- `connectOAuthServer`: when returning the authorize redirect,
  `logger.info({ serverId: server.id, userId }, '[mcp] OAuth authorization required')`
- `connectBearerServer`: no extra log needed beyond finalize (success/failure
  both route through the finalize helpers). NEVER log `rawToken` or any
  decrypted credential; do not add the token to any fields object.

**Verify**: `bun typecheck` && `bun check` → exit 0;
`grep -c "logger\." apps/bot/src/lib/mcp/connection.ts` → ≥ 3;
`grep -n "rawToken" apps/bot/src/lib/mcp/connection.ts` → appears only in the
existing parameter/encrypt lines, never inside a logger call.

### Step 2 (Part B): Add the log-context store and mixin

Create `packages/logging/src/context.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface LogContext {
  ctxId: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}
```

In `packages/logging/src/logger.ts`, add to the `base` options object:

```ts
mixin: () => getLogContext() ?? {},
```

(pino merges mixin fields into every log line; an explicit `ctxId` field
passed at a call site overrides the mixin value, which is the desired
precedence.) Export `runWithLogContext` from the package the same way
`createLogger` is exported (check `package.json` exports map; per-file
`./context` export follows the existing pattern).

**Verify**: `bun typecheck` → exit 0.

### Step 3 (Part B): Wrap the entry points

1. In `apps/bot/src/slack/events/message-create/index.ts`, find where the
   handler has the context object (where `getContextId(context)` is or could
   be computed) and wrap the downstream processing:

   ```ts
   await runWithLogContext({ ctxId }, () => /* existing processing call */);
   ```

   Keep the wrap at the outermost point where ctxId is known; do not refactor
   the handler beyond inserting the wrapper.
2. In `actions/approval.ts`, wrap the body of `execute` after `ack()` the same
   way (ctxId from the approval's context once `resumeContext` is built — if
   ctxId is only derivable late, wrap from that point; partial coverage is
   acceptable and should be noted).

**Verify**: `bun typecheck` && `bun check` → exit 0. Manual check (include
result in report if you can run it): `bun dev:bot` against a dev workspace,
send a message, confirm nested log lines (e.g. wrapper.ts tool logs, db query
warnings) show the `[ctxId]` prefix without those call sites passing it.

### Step 4: Unit-test the context store

Create `packages/logging/src/context.test.ts` (bun:test, pattern from plan
001): assert `getLogContext()` is undefined outside `runWithLogContext`,
returns the context inside, supports nesting (inner context wins, outer
restored after), and survives an `await` boundary inside the callback.

**Verify**: `cd packages/logging && bun test` → all pass. Add the `test`
script to `packages/logging/package.json` (`"test": "bun test"`) so
`turbo run test` picks it up.

## Test plan

- `packages/logging/src/context.test.ts` — 4 cases listed in step 4.
- Connection logging (part A) has no harness — verified by grep + typecheck +
  the manual dev-run recipe.

## Done criteria

- [ ] `bun typecheck`, `bun check`, `bun run test` all exit 0
- [ ] `connection.ts` logs connected / failed / authorize-required, with no
      credential material in any log call
- [ ] `packages/logging` exports `runWithLogContext`; `createLogger` has the
      mixin
- [ ] Both entry points wrap processing in `runWithLogContext`
- [ ] New tests in `packages/logging` pass under `bun run test`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Bun's `AsyncLocalStorage` does not propagate across the AI SDK's stream
  consumption in step 3's manual check (context lost after `await` into the
  SDK) — report the boundary where it drops instead of adding per-call
  plumbing.
- The pino `mixin` option conflicts with the transport setup in any of the
  three `createLogger` branches (Vercel / dev pretty / prod file).
- `message-create/index.ts`'s structure has no single point where ctxId is
  known before processing fans out.

## Maintenance notes

- Future log call sites no longer need to pass `ctxId` explicitly when running
  under a wrapped entry point; existing explicit fields are harmless.
- If the bot ever adopts OTel tracing fully (Langfuse deps are present),
  the ALS store is the natural place to also carry a trace/span id.
- Reviewer: check that no log line in part A includes `rawToken`, decrypted
  tokens, or OAuth `tokens` objects; and that the mixin returns `{}` (not
  `undefined`) when unset.
