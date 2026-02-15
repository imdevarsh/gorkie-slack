# Gorkie Sandbox Refactor (Hard Cut to E2B)

## Non-Negotiables
1. E2B only.
2. No legacy compatibility path.
3. No feature flag for old stack.
4. Delete existing Daytona + sandbox-agent + OpenCode transport code.
5. Keep provider/API secrets server-side only.

## Mandatory Reads Before Coding
- `~/.claude/conventions`
- `~/.claude/AGENTS.md`
- `https://e2b.dev/docs/llms.txt`
- `MAIN_BRANCH_SANDBOX_INVESTIGATION.md`

## Objective
Replace the current sandbox implementation with an E2B-native execution stack, while preserving the best orchestration ergonomics from main branch.

## Architecture (Final)
```text
Slack message/thread
  -> Orchestrator agent (server-side AI SDK)
    -> sandbox chat tool (single delegation)
      -> Sandbox execution agent (server-side AI SDK)
        -> typed E2B tools (command/fs/upload)
          -> E2B sandbox
```

Rules:
- Both agents run in our app process.
- No in-sandbox agent runtime.
- No ACP/OpenCode/session-update stream reconstruction.

## Main-Inspired Patterns We Keep
1. Orchestrator -> sandbox tool -> execution agent delegation shape.
2. Modular sandbox prompt structure (`core`, `environment`, `tools`, `workflow`, `examples`, `context`).
3. Typed sandbox tools (`runCommand`, `read`, `write`, `edit`, `glob`, `grep`, `upload/show`).
4. Deterministic status strings (`is <doing something>`).

## Legacy Patterns We Must Not Keep
1. Daytona preview/session transport behavior.
2. sandbox-agent server bootstrap/health/reconnect logic.
3. OpenCode `/opencode` message polling/parsing.
4. Compatibility flags (`legacy|e2b`) and dual-run paths.

## Security Model
Hard requirements:
1. LLM provider keys never enter sandbox env/files.
2. Slack bot token never enters sandbox env/files.
3. Sandbox receives only task input + attachments.
4. No long-lived in-sandbox daemon that can expose secrets.

## Data Model (Target)
`sandbox_sessions` should contain only E2B-relevant fields:
- `thread_id` (PK)
- `channel_id`
- `sandbox_id`
- `status` (`creating|active|resuming|paused|destroyed|error`)
- `last_error`
- `created_at`, `updated_at`, `paused_at`, `resumed_at`, `destroyed_at`

Delete fields tied to old stack:
- `agent_session_id`
- `last_connection_id`
- preview URL/token/expiry fields
- any OpenCode transport metadata

## Prompt Contract (Sandbox Execution Agent)
- Working directory and file rules are explicit.
- Generated outputs: `/home/daytona/output`
- Slack-visible artifacts: `/home/daytona/output/display`
- Use `cp` not `mv` when staging display artifacts.
- On command failure: inspect stderr and retry with a corrected approach.
- Final response includes exact output paths and actions taken.
- COPY all prompts from main branch

## Tool Contract (E2B)
Required tools (or equivalent):
2. `syncAttachments`
3. `runCommand`
4. `readFile`
5. `writeFile`
6. `editFile`
7. `globFiles`
8. `grepFiles`
9. `showFile`

## Reliability
2. Idempotent `ensureSandbox` behavior.
3. Explicit status transitions persisted in DB.
4. Strict command timeout and bounded retry.

## Observability
Log every major phase with structured fields:
- sandbox create/reuse/destroy
- tool name + sanitized input + result + duration
- upload outcomes
- error code taxonomy

## Rollout
Hard cut rollout only:
1. Replace stack in-place.
2. Run full validation matrix.
3. Deploy E2B-only implementation.
4. Remove dead code immediately after verification.

No dual-stack operation.

FIRST BEFORE DOING EVERYTHING DIG INTO MAIN BRANCH"S Sandbox impl the only dsifference is were swapping to e2b and scrapping redis, and having cleaner code
ALWAYS READ e2b.dev/docs/llms.txt
