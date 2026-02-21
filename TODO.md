# TODO

## Current Priority
1. Execute `TODO_REFACTOR_IMPLEMENTATION.md` top-to-bottom with no legacy compatibility.
2. Keep architecture fixed to: orchestrator -> chat sandbox tool -> sandbox execution agent -> typed E2B tools.
3. Remove all Daytona/sandbox-agent/OpenCode runtime code.

## Immediate Next Actions
1. Rewrite `server/lib/sandbox/*` to E2B lifecycle + filesystem modules.
2. Rewrite `server/lib/ai/tools/chat/sandbox.ts` to new E2B delegation path.
3. Rebuild sandbox execution agent and typed sandbox tools.
4. Complete compile/lint/manual validation matrix.
5. Implement E2B inactivity auto-delete policy (nuke sandbox after X idle time); currently not implemented because pause vs delete cost is near-equal, but we still want deterministic cleanup semantics.

## Gate Before Merge
1. `bun x tsc --noEmit` passes.
2. `bun run lint` passes.
3. Manual Slack sandbox scenarios pass with sandbox reuse and display uploads.

- Show tool call on prepareStep to reduce lag
- Articulate the bash tool inputs and outputs, e.g exit codes better

- Also, for upload files round to mb/gb whatever
- For prepareStep, always run tool call
- Do NOT truncate the task text... 
- Also, for web search show sources (new param in slack sdk)
- For sending 4 replies said (showing only first reply)
- if one thing has an error the whole task is marked as failed (fix it)
- if the items exceed the limit they split into another plan, why? and the remaining steps vanished (https://hackclub.slack.com/archives/C0A6C5F52BE/p1771610325086369)