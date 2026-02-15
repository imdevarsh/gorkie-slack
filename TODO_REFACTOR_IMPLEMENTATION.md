# E2B Hard-Cut Refactor TODO

## Global Rules
1. E2B only.
2. No legacy fallback branch.
3. No compatibility feature flags.
4. Delete old stack first, then rebuild cleanly.

## Phase 0: Read + Inventory
1. Read:
   - `REFACTOR.md`
   - `MAIN_BRANCH_SANDBOX_INVESTIGATION.md`
   - `https://e2b.dev/docs/llms.txt`
2. Inventory all old-stack files/usages:
   - Daytona SDK usage
   - sandbox-agent usage
   - OpenCode transport logic
   - old DB fields

Deliverable:
- Exact delete/rewrite list.

## Phase 1: Hard Delete Legacy Stack
1. Delete all sandbox-agent/OpenCode transport modules and call paths.
2. Delete Daytona-specific runtime/session/snapshot code.
3. Delete stale prompt glue tied to old event stream handling.
4. Remove obsolete DB schema/query fields.
5. Ensure zero references remain via `rg`.

Deliverable:
- Codebase has no production references to old stack.

## Phase 2: E2B Foundations
1. Add E2B dependencies.
2. Update env validation with E2B vars.
3. Update config for E2B runtime and timeouts.
4. Implement E2B sandbox runtime module.

Deliverable:
- E2B runtime compiles and basic sandbox ops work.

## Phase 3: Session/Data Layer
1. Rewrite `sandbox_sessions` schema to E2B-only fields.
2. Implement query helpers for status lifecycle.
3. Add per-thread lock and idempotent `ensureSandbox`.

Deliverable:
- Stable session lifecycle under concurrency.

## Phase 4: Tool Layer (Clean Rebuild)
1. Implement typed tools for command/fs/search/upload.
2. Implement attachment sync into canonical attachment dir.
3. Implement display artifact upload from canonical display dir.
4. Ensure strict structured result payloads.

Deliverable:
- Sandbox execution agent can complete file/code tasks end-to-end.

## Phase 5: Agent + Prompt Layer
1. Keep main-style agent split:
   - orchestrator agent
   - sandbox execution agent
2. Rebuild sandbox prompt modules with deterministic constraints.
3. Enforce output/display/status rules in prompt and tool contracts.

Deliverable:
- Deterministic and concise sandbox behavior.

## Phase 6: Observability + Error Taxonomy
1. Add structured logs across runtime and tools.
2. Add stable error codes for common failures.
3. Add tracing spans where useful.

Deliverable:
- Debuggable runtime with clear failure reasons.

## Phase 7: Validation
1. Static checks:
   - `bun run check`
   - `bun x tsc --noEmit`
2. Manual scenarios:
   - create/reuse sandbox
   - attachment processing
   - display upload
   - command timeout/retry
   - teardown/recreate
3. Security verification:
   - ensure secrets never appear in sandbox env/files/logs

Deliverable:
- Verified E2B-only sandbox system.

## Completion Criteria
1. Old stack fully removed.
2. E2B-only runtime in production code.
3. No legacy compatibility code paths.
4. All checks pass.
