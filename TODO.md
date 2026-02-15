# TODO

## P0 - Hard Cut to E2B
- Delete all Daytona + sandbox-agent + OpenCode transport code.
- Rebuild sandbox runtime as E2B-only.
- Rebuild sandbox tooling as E2B-only typed tools.
- Remove old DB fields and queries tied to old stack.
- Keep orchestrator -> sandbox execution agent pattern from main.

## P0 - Security
- Ensure provider keys never enter sandbox env/files.
- Ensure Slack token never enters sandbox env/files.
- Add error taxonomy for sandbox failures.

## P1 - Reliability
- Add per-thread lock for sandbox lifecycle.
- Add idempotent ensure/reuse behavior.
- Add timeout + retry policy tests.

## P1 - Observability
- Add structured logs for tool input/output summaries.
- Add lifecycle logs for create/reuse/destroy.
- Clean up tracing so sandbox runs are coherent.

## P2 - Cleanup
- Remove dead imports/exports after hard cut.
- Simplify path handling helpers.
- Fix remaining lint/type debt.
