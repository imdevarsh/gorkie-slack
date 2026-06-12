# Plan 002: Recover scheduled tasks whose run claim was orphaned by a crash

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- packages/db/src/queries/scheduled-tasks.ts apps/bot/src/lib/tasks/runner.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

The scheduled-task runner claims a task by setting `runningAt` and only
considers tasks where `runningAt IS NULL`. The flag is cleared by
`completeScheduledTaskRun` / `disableScheduledTask` / `cancelScheduledTaskForUser`
— all of which run in-process. If the bot process crashes or is redeployed
between claim and completion, `runningAt` stays set **forever**: the task is
never listed as due again, never claimed again, and silently never runs again.
The user sees `lastStatus: 'running'` indefinitely with no error. The fix is a
stale-claim cutoff so an orphaned claim becomes reclaimable after a timeout.

## Current state

- `packages/db/src/queries/scheduled-tasks.ts` — all scheduled-task queries.
  Current drizzle imports (line 1):
  `import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';`

  `listDueScheduledTasks` (lines 52–65):

  ```ts
  export function listDueScheduledTasks(now: Date, limit = 20) {
    return db
      .select()
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.enabled, true),
          isNull(scheduledTasks.runningAt),
          lte(scheduledTasks.nextRunAt, now)
        )
      )
      .orderBy(asc(scheduledTasks.nextRunAt))
      .limit(limit);
  }
  ```

  `claimScheduledTaskRun` (lines 67–87) — atomic conditional UPDATE with the
  same three predicates plus `eq(scheduledTasks.id, taskId)`; sets
  `runningAt: now, lastStatus: 'running', lastError: null, updatedAt: now` and
  returns the row (or null if the claim lost the race). **This atomicity is
  correct and must be preserved** — it is what prevents two instances from
  running the same task concurrently.

- `apps/bot/src/lib/tasks/runner.ts` — sweeps every 30s
  (`RUNNER_INTERVAL_MS = 30_000`), batch size 20. `runTask` (lines 71–141)
  always reaches `completeScheduledTaskRun` or `disableScheduledTask` in normal
  control flow — the orphan only happens on process death. No changes needed
  here.

- Repo conventions: constants at module scope with descriptive names; dict
  params for multi-param functions (these functions predate that and take
  positional args — leave their signatures as-is); Ultracite/Biome enforced.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |
| Tests     | `bun run test`           | all pass (if plan 001 has landed) |

## Scope

**In scope** (the only file you should modify):

- `packages/db/src/queries/scheduled-tasks.ts`

**Out of scope** (do NOT touch):

- `apps/bot/src/lib/tasks/runner.ts` — the in-process `isRunning` flag and the
  sweep loop are correct; do not add distributed locking, Redis, or startup
  reset logic.
- `packages/db/src/schema/scheduled-tasks.ts` — no schema change is needed;
  the fix is purely in query predicates.
- Any approval/MCP code.

## Git workflow

- Branch: `advisor/002-scheduled-task-stale-claim`
- Conventional commit, e.g. `fix: reclaim scheduled tasks orphaned by a crashed run`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the stale cutoff to both predicates

In `packages/db/src/queries/scheduled-tasks.ts`:

1. Extend the drizzle import with `lt` and `or`.
2. Add a module-scope constant with a one-line comment stating the constraint:

   ```ts
   // A run claim older than this is assumed orphaned by a crashed process
   // and becomes reclaimable. Must comfortably exceed the longest legitimate
   // task run (agent stream + Slack delivery).
   const STALE_RUN_CLAIM_MS = 30 * 60 * 1000;
   ```

3. In **both** `listDueScheduledTasks` and `claimScheduledTaskRun`, replace
   the `isNull(scheduledTasks.runningAt)` predicate with:

   ```ts
   or(
     isNull(scheduledTasks.runningAt),
     lt(scheduledTasks.runningAt, new Date(now.getTime() - STALE_RUN_CLAIM_MS))
   )
   ```

   Both functions already receive `now: Date` — derive the cutoff from it, not
   from `new Date()`, so list and claim agree within a sweep.

Keep everything else in both functions identical — especially the
`lte(nextRunAt, now)` and `enabled` predicates and the `.returning()` in the
claim.

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0.

### Step 2: Confirm the claim is still race-safe

Read the final `claimScheduledTaskRun`. It must still be a **single** UPDATE
whose WHERE clause does the filtering (no select-then-update split). Two
processes claiming a stale task simultaneously must still serialize: the first
UPDATE sets `runningAt = now`, which makes the second UPDATE's
`or(isNull, lt(...cutoff))` predicate false (a just-set `runningAt` is newer
than the cutoff). Confirm by reading the code that this property holds.

**Verify**: `grep -n "await db" packages/db/src/queries/scheduled-tasks.ts` —
`claimScheduledTaskRun` still contains exactly one `db.update(...)` statement
and no `db.select` before it.

## Test plan

There is no test-database harness in this repo (plan 001 covers only pure
functions). Do not invent one here. Verification for this plan is:
typecheck + lint + the step-2 reading check. If a DB test harness exists by
the time you execute this (check for `packages/db/**/*.test.ts`), add one test:
claim a task, simulate a stale claim by setting `runningAt` 31 minutes in the
past, and assert `claimScheduledTaskRun` succeeds.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun check` exits 0
- [ ] Both `listDueScheduledTasks` and `claimScheduledTaskRun` contain the
      `or(isNull(...), lt(...))` predicate:
      `grep -c "STALE_RUN_CLAIM_MS" packages/db/src/queries/scheduled-tasks.ts` → ≥ 3
      (constant definition + two uses)
- [ ] `claimScheduledTaskRun` is still a single atomic UPDATE
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current code already contains stale-claim handling (drift since
  planning).
- You find call sites of `claimScheduledTaskRun` other than
  `apps/bot/src/lib/tasks/runner.ts:152`
  (`grep -rn "claimScheduledTaskRun" apps packages`) — another caller may
  depend on the strict `isNull` semantics.
- You feel the need to change `runner.ts` or the schema — that's out of scope;
  report why instead.

## Maintenance notes

- If a legitimate task run can ever exceed 30 minutes (e.g. long sandbox
  agent runs are added to scheduled tasks), `STALE_RUN_CLAIM_MS` must be
  raised, or the runner should heartbeat `runningAt` periodically — revisit
  then; heartbeating was deliberately not added now (single-instance
  deployment, runs are short).
- A reclaimed task reruns its prompt from scratch; the task agent's delivery
  is via `sendScheduledMessage`, so a crash after delivery but before
  `completeScheduledTaskRun` can cause one duplicate message after the
  timeout. Accepted trade-off versus the task dying forever; reviewers should
  be aware.
