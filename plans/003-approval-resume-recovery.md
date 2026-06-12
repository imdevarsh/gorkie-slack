# Plan 003: Make a failed post-approval resume recoverable instead of permanently stuck

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- apps/bot/src/slack/features/customizations/mcp/actions/approval.ts packages/db/src/queries/mcp/approvals.ts apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (001 recommended first for the lint/test gate)
- **Category**: bug
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

When a user answers an MCP tool-approval card, the handler finalizes the
approval batch in the DB (`status: 'approved' | 'denied'`) **before** the
resume job is enqueued. If `resumeResponse` then fails (Slack API error, model
provider outage, queue rejection), the catch handler posts "Something went
wrong resuming after your approval. Please try again." — but there is nothing
to try again: the approval is already finalized, so clicking any approval
button hits the `status !== 'pending'` guard and renders "Already handled."
The paused agent run is permanently lost and the user message is silently
dropped. This was flagged in `docs/mcp-improvements.md` item 6 and is still
present.

## Current state

- `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts` — the
  button handler. Relevant flow (verified at the planned commit):
  - Line 71: `getMCPToolApprovalStatus({ approvalId })`; line 88: if
    `status.status !== 'pending'` → "Already handled" card and return.
  - Line 112: `claimMCPToolApproval` (atomic `pending → handling` claim).
  - Line 188: `finalizeMCPToolApprovalInBatch({ approvalId, status, userId })`
    — transactionally marks this approval and returns
    `{ batchComplete, siblings }` once every sibling in the batch is settled.
  - Lines 213–234: when `batchComplete`, enqueue the resume:

    ```ts
    getQueue(getContextId(resumeContext))
      .add(() =>
        resumeResponse({ approvals, context: resumeContext, messages, requestHints })
      )
      .catch((error: unknown) => {
        logger.error({ err: error, approvalId }, 'Failed to resume MCP approval');
        resumeContext.client.chat
          .postMessage({
            channel: resumeContext.event.channel,
            thread_ts: resumeContext.event.thread_ts ?? undefined,
            text: 'Something went wrong resuming after your approval. Please try again.',
          })
          .catch(() => undefined);
      });
    ```

  - Lines 235–242: the outer `catch` resets **only this approval** to
    `'pending'` and rethrows — it does not cover async failures inside the
    queued job (the `.catch` above does, and it currently recovers nothing).

- `packages/db/src/queries/mcp/approvals.ts` — `finalizeMCPToolApprovalInBatch`
  (lines 116–181): transaction, `FOR UPDATE` lock on all batch siblings
  (`ORDER BY id` for consistent lock order), updates this approval's status,
  returns `batchComplete: true` plus all settled siblings when no sibling is
  still `pending`/`handling`. `updateMCPToolApproval` (lines ~95–112) is a
  generic per-approval status setter scoped by `approvalId + userId`.

- `packages/db/src/schema/mcp.ts` — `mcpToolApprovals` stores per approval:
  `approvalId` (unique), `serverId`, `userId`, `teamId`, `channelId`,
  `threadTs`, `eventTs`, `messageTs` (the Slack ts of the posted approval
  card), `toolName`, `toolCallId`, `args` (encrypted), `state` (encrypted
  resume state), `status` enum
  `['pending','handling','approved','denied','superseded']`.

- `apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`:
  - `postApprovalRequest` (line 135) — posts an approval card and records
    `messageTs` (line 208). Read this function before step 2: it contains the
    block structure of a live approval card (approve / always-allow / deny
    buttons whose action `value` is the `approvalId`).
  - `supersedeExpiredApprovals` (around lines 40–70) — existing example of
    editing previously posted approval cards via stored
    `channelId` + `messageTs` (`if (!approval.messageTs) continue; ... ts: approval.messageTs`).
    Use this as the structural pattern for restoring cards.

- `resumeResponse` (`.../utils/resume.ts`) appends `tool-approval-response`
  parts and calls `runAgent` — no changes needed there.

- Conventions: dict params (single options object), inline-over-extract
  (helpers only when called from 2+ places), Ultracite/Biome, conventional
  commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |
| Tests     | `bun run test`           | all pass (if plan 001 landed) |

## Scope

**In scope**:

- `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`
- `packages/db/src/queries/mcp/approvals.ts` (add one query)
- `apps/bot/src/slack/events/message-create/utils/approval-helpers.ts`
  (ONLY if you need to export an existing card-blocks builder for reuse; do
  not restructure the file)

**Out of scope** (do NOT touch):

- `finalizeMCPToolApprovalInBatch`'s transaction/locking logic — it is correct.
- `resume.ts`, `respond.ts`, the orchestrator, `wrapper.ts`.
- The "denied tools in thinking panel" improvement (tracked separately in
  TODO.md/BUGS.md) — do not bundle it in.
- Approval card visual design beyond what recovery requires.

## Git workflow

- Branch: `advisor/003-approval-resume-recovery`
- Conventional commit, e.g. `fix: reopen approval batch when post-approval resume fails`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a batch-reopen query

In `packages/db/src/queries/mcp/approvals.ts`, add:

```ts
export async function reopenMCPToolApprovals({
  approvalIds,
  userId,
}: {
  approvalIds: string[];
  userId: string;
}): Promise<MCPToolApproval[]> {
  if (approvalIds.length === 0) {
    return [];
  }
  const rows = await db
    .update(mcpToolApprovals)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(
      and(
        inArray(mcpToolApprovals.approvalId, approvalIds),
        eq(mcpToolApprovals.userId, userId),
        inArray(mcpToolApprovals.status, ['approved', 'denied'])
      )
    )
    .returning();
  return rows;
}
```

Add `inArray` to the existing drizzle-orm import. The
`status IN ('approved','denied')` guard means a concurrent supersede (a new
user message arrived meanwhile) is not clobbered back to pending.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Reopen and restore cards in the resume `.catch`

In `approval.ts`, replace the body of the `.catch` on the
`getQueue(...).add(...)` call (lines 222–234) with logic that:

1. Logs the error (keep the existing `logger.error`).
2. Calls `reopenMCPToolApprovals({ approvalIds: batch.siblings.map((s) => s.approvalId), userId: body.user.id })`.
3. For each reopened approval that has a `messageTs`, restores its card to an
   actionable state via `client.chat.update({ channel: approval.channelId, ts: approval.messageTs, ... })`,
   reusing the same blocks that `postApprovalRequest` posts (the buttons carry
   `approvalId` as the action value, so the existing button handlers work
   again on the reopened approval). If the card-blocks builder inside
   `approval-helpers.ts` is not currently exported, export it — do not
   duplicate the block structure.
4. Posts ONE thread message with honest copy, e.g.:
   `Resuming after your approval failed. The approval buttons are active again — please respond once more.`
   (replacing the current misleading "Please try again.")
5. Wraps 2–4 in its own try/catch that logs on failure
   (`'Failed to reopen approval batch after resume failure'`) — recovery must
   never throw into the void.

Decrypt note: the restored card needs the tool input preview. `approval.args`
is encrypted; this file already imports `decrypt` from `@/lib/mcp/encryption`
and uses it at line 157 (`approval.args ? decrypt(approval.args) : undefined`).
Follow that exact pattern; never log or display the decrypted args beyond what
the original card showed.

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0.

### Step 3: Confirm the reopened path round-trips

Read through the flow end-to-end and confirm:

- A reopened approval has `status: 'pending'`, so the line-88 guard passes and
  the line-112 claim succeeds on the next button click.
- `claimMCPToolApproval` transitions `pending → handling` (read it in
  `approvals.ts` to confirm the claim predicate accepts `pending`).
- `finalizeMCPToolApprovalInBatch` recomputes batch completeness from current
  statuses, so a reopened batch finalizes correctly on the second pass.

**Verify**: describe the round-trip in your report referencing the exact
guards (file:line). This is a reading gate, not a runtime gate — there is no
integration test harness for Slack flows.

## Test plan

No Slack/DB integration harness exists. Add a pure unit test only if you can
isolate one (e.g. if you extracted a card-blocks builder, snapshot its block
structure in `apps/bot/src/slack/events/message-create/utils/approval-helpers.test.ts`
using the plan-001 pattern). Otherwise the verification gates above stand in.
Manual validation recipe for the operator (include in your report): point the
bot at a dev workspace, configure an MCP tool with mode `ask`, kill the model
provider (e.g. set an invalid provider key) so `resumeResponse` fails, approve
a tool, observe the card reactivate and the honest failure message; restore
the key, approve again, observe the run resume.

## Done criteria

- [ ] `bun typecheck` exits 0; `bun check` exits 0
- [ ] `reopenMCPToolApprovals` exists in `packages/db/src/queries/mcp/approvals.ts`
      with the `status IN ('approved','denied')` guard
- [ ] The resume `.catch` in `approval.ts` calls it and restores cards via
      stored `channelId` + `messageTs`
- [ ] `grep -n "Please try again" apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`
      → no match for the old misleading copy
- [ ] No duplicated approval-card block structure (the builder is shared with
      `postApprovalRequest`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `postApprovalRequest`'s card blocks depend on state that is not stored on
  the approval row (you cannot faithfully restore the card from
  `channelId`/`messageTs`/`toolName`/`serverId`/`args`) — report what is
  missing instead of inventing a degraded card.
- The claim/finalize functions' semantics differ from the descriptions above
  (drift).
- You find yourself wanting to reorder finalize-after-enqueue (the
  alternative fix sketched in `docs/mcp-improvements.md` item 6) — that
  restructuring has wider blast radius (the queue job would need the
  finalize transaction's results) and was deliberately not chosen; report
  rather than switching approach.

## Maintenance notes

- If approval batching changes (e.g. per-tool resume instead of
  all-siblings-at-once), the reopen path must change with it — they share the
  `batch.siblings` shape.
- Reviewer should scrutinize: the reopen guard statuses (must not resurrect
  `superseded` approvals) and that the restored card's buttons carry the same
  `approvalId` values as the original.
- Deferred: surfacing denied tools in the resumed stream's thinking panel
  (TODO.md item) — separate change, do not entangle.
