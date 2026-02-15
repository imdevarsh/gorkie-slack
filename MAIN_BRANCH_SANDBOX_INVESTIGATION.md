# Main Branch Sandbox Investigation

## Scope
Investigated `main` in a separate worktree at `/workspaces/gorkie-slack-main` (commit `2488cea4ac6df97437517cbb4eeee145053de070`).

Goal: document exactly how the older “sandbox tool + sub-agent” model worked so we can intentionally carry forward the good parts while migrating to E2B and removing `sandbox-agent`.

## End-to-End Flow on `main`
1. Chat orchestrator calls chat-level sandbox tool.
- File: `/workspaces/gorkie-slack-main/server/lib/ai/agents/orchestrator.ts`
- Tool registered as `sandbox: sandbox({ context, files })`.

2. Chat sandbox tool delegates to a dedicated sandbox agent.
- File: `/workspaces/gorkie-slack-main/server/lib/ai/tools/chat/sandbox.ts`
- Steps:
  - set status (`is delegating a task to the sandbox`)
  - `getSandbox(context)` (lifecycle/reuse)
  - `syncAttachments(instance, context, files)`
  - `buildSandboxContext(context)` (recent messages + existing file hints)
  - create `sandboxAgent({ context, requestHints })`
  - run `agent.generate(...)` with user task
  - return `{ success, summary: result.text, steps }`

3. Sandbox agent executes via AI SDK `ToolLoopAgent` with sandbox tools.
- File: `/workspaces/gorkie-slack-main/server/lib/ai/agents/sandbox-agent.ts`
- Model: `provider.languageModel('agent-model')`
- Stop condition: `stepCountIs(30)`
- Tools:
  - `bash`, `glob`, `grep`, `read`, `write`, `edit`, `showFile`
  - plus `searchWeb`, `getUserInfo`

4. Tool implementations directly operate sandbox filesystem/processes.
- Files:
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/bash.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/glob.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/grep.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/read.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/write.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/edit.ts`
  - `/workspaces/gorkie-slack-main/server/lib/ai/tools/sandbox/show-file.ts`

5. Sandbox lifecycle is managed with Redis keys + Vercel Sandbox snapshots.
- File: `/workspaces/gorkie-slack-main/server/lib/sandbox/lifecycle.ts`
- Behavior:
  - tries reconnect via `redisKeys.sandbox(ctxId)` + `Sandbox.get(...)`
  - else provisions new or restores from snapshot
  - stores sandbox ID in Redis with TTL
  - on stop: snapshot + register snapshot metadata + cleanup old snapshots

## Sandbox Prompt Stack on `main`
Prompt is composed from modular files:
- `/workspaces/gorkie-slack-main/server/lib/ai/prompts/sandbox/index.ts`
  - `core`, `environment`, `context`, `tools`, `workflow`, `examples`

Important prompt constraints already present:
- explicit absolute-path guidance (`/home/vercel-sandbox/...`)
- deterministic output convention (`output/`)
- iterative retry behavior on command failure
- explicit `showFile` upload behavior
- short status format (`is xyz`)
- follow-up continuity guidance using prior logs/context

## Runtime / Filesystem Model on `main`
Config:
- File: `/workspaces/gorkie-slack-main/server/config.ts`
- `runtime: 'node22'`, `timeoutMs: 10 min`, Redis TTL `10 min`, snapshot TTL `24h`.

Paths:
- File: `/workspaces/gorkie-slack-main/server/lib/sandbox/utils.ts`
- root: `/home/vercel-sandbox`
- turn logs: `agent/turns/<message_ts>.json`

Bootstrapping:
- File: `/workspaces/gorkie-slack-main/server/lib/sandbox/bootstrap.ts`
- creates directories:
  - `attachments`
  - `agent/turns`
  - `agent/bin`
  - `output`
- uploads helper scripts from repo `sandbox/agent/bin`.

Attachment sync:
- File: `/workspaces/gorkie-slack-main/server/lib/sandbox/attachments.ts`
- downloads Slack files and writes to `attachments/`.

## Why This Worked (Useful Patterns to Keep)
1. Clear two-layer delegation contract:
- chat tool delegates one concise task to execution agent.

2. Strong local tool surface:
- explicit `read/write/edit/glob/grep/bash/showFile` tools.

3. Prompt structure is explicit and practical:
- environment, workflow, and tool rules are separated and maintainable.

4. Output/upload discipline:
- `showFile` is explicit and integrated in workflow.

5. Basic persistence model:
- reuse + restore pattern existed and gave multi-turn continuity.

## Problems Observed in This Model
1. Dual-agent complexity:
- orchestrator + sandbox sub-agent can drift and add latency.

2. Redis-only runtime state:
- fragile for richer lifecycle/audit requirements.

3. Coupling to Vercel Sandbox APIs + snapshot behavior:
- not aligned with current E2B direction.

4. Prompt over-prescription in places:
- some repeated guidance and long constraints increased prompt bloat.

## What to Port into E2B Rewrite
Keep:
1. The tool-based execution contract.
2. The modular sandbox prompt structure.
3. Status string convention (`is <doing something>`).
4. Output path discipline and explicit upload step.
5. “single sandbox call per user request” behavior from chat prompt guidance.

Drop/replace:
1. Vercel Sandbox lifecycle + snapshot implementation.
2. Redis-only authoritative sandbox mapping.
3. Any `sandbox-agent`/OpenCode transport assumptions.
4. Implicit file discovery behavior that can be made deterministic by stricter tool contracts.

## Proposed Mapping to New E2B Stack
Main-style primitive -> E2B rewrite equivalent

1. `getSandbox/reconnectSandbox` -> `ensureSandbox(threadId)` (DB-backed + lock).
2. `syncAttachments` -> E2B FS upload helper with canonical paths.
3. `buildSandboxContext` -> lightweight request hints + optional file index helper.
4. `bash` -> `runCommand` tool with strict timeout and structured result.
5. `showFile` -> explicit display artifact upload tool using `output/display`.
6. `agent/turns/*.json` -> server-side structured run logs (plus optional sandbox log file mirror).

## Immediate Action Items for Current Branch
1. Recreate the same tool ergonomics on E2B:
- `runCommand`, `readFile`, `writeFile`, `editFile`, `globFiles`, `grepFiles`, `uploadDisplayArtifacts`.

2. Keep sandbox prompt modular:
- mirror `core/environment/workflow/tools/examples` pattern.

3. Encode deterministic artifact policy:
- all outputs under `/home/daytona/output`
- user-visible files under `/home/daytona/output/display`

4. Preserve chat-level single delegation:
- keep sandbox tool as one high-level call from orchestrator.
