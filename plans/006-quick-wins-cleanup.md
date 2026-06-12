# Plan 006: Quick wins — MCP response size cap, dead deps, pre-commit gate, db:migrate cleanup, doc refresh

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- packages/utils/src/guarded-fetch.ts apps/bot/src/lib/mcp/guarded-fetch.ts apps/bot/package.json package.json turbo.json lefthook.yml packages/db/package.json docs/mcp-improvements.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S (half a day total; five independent sub-tasks)
- **Risk**: LOW
- **Depends on**: none (sub-task E touches the same doc as plan 004 — apply 004 first or merge carefully)
- **Category**: tech-debt / security / dx
- **Planned at**: commit `7e2862a`, 2026-06-12

Each sub-task (A–E) is independently committable. Do them in order; commit per
sub-task with the message given.

## Why this matters

Five small, verified issues with disproportionate payoff: (A) an MCP server
can stream an unbounded response into bot memory and model context —
`docs/mcp-improvements.md:14` *claims* guarded-fetch enforces size caps, but it
does not; (B) dead dependencies (`pino`/`pino-pretty` in the bot, `pg`/
`@types/pg` in the catalog after the Neon-driver switch in commit `aed17fc`)
mislead maintainers about the logging and DB strategy; (C) nothing runs lint or
typecheck before a commit — CI catches it minutes later; (D) `db:migrate`
scripts exist but `packages/db/src/migrations` does not — the command fails and
the migration strategy is ambiguous; (E) `docs/mcp-improvements.md` lists two
security items that are already fixed, which misdirects future work (it nearly
misdirected this audit).

## Current state

- **A.** `packages/utils/src/guarded-fetch.ts` (entire file, 35 lines):
  `createGuardedFetch({ timeoutMs })` validates the URL via
  `mcpServerUrlSchema` (HTTPS + DNS-resolved IP range blocking — that part is
  good), then does `fetch(url, { redirect: 'error', signal: ... })` with a
  timeout. **No response size limit of any kind.** Sole caller:
  `apps/bot/src/lib/mcp/guarded-fetch.ts`:

  ```ts
  export const guardedMCPFetch = Object.assign(
    createGuardedFetch({ timeoutMs: mcp.requestTimeoutMs }),
    { preconnect: fetch.preconnect }
  );
  ```

  `mcp` config comes from `apps/bot/src/config.ts` (read its `mcp` section
  before editing to match its naming style).

- **B.** `apps/bot/package.json` dependencies include `"pino": "catalog:"` and
  `"pino-pretty": "catalog:"` — the bot imports neither (it logs via
  `@repo/logging`, which declares both itself in
  `packages/logging/package.json`; pino-pretty is loaded by pino as a
  transport by name, resolved from `@repo/logging`'s own deps). Root
  `package.json` catalog still has `"@types/pg": "^8.16.0"` (line ~21) and
  `"pg": "^8.21.0"` (line ~34) with zero remaining importers (verified by
  grep). Knip confirms all four. **Knip false positives you must NOT remove**:
  `taze.config.ts` (read by the `taze` CLI via `update-pkgs` script),
  `turbo/generators/config.ts` (read by `@turbo/gen`), the `@cspell/dict-*`
  deps and `cspell` in `tooling/cspell` (referenced by cspell config, not
  imports), `@biomejs/biome`, `@repo/cspell-config`, `@turbo/gen` (root dev
  tooling).

- **C.** `lefthook.yml` (entire file):

  ```yaml
  post-merge:
    commands:
      install-deps:
        run: bun install

  commit-msg:
    commands:
      "lint commit message":
        run: bun commitlint --edit {1}
  ```

  No pre-commit hook. `bun x ultracite check <files>` accepts file arguments.

- **D.** `packages/db/drizzle.config.ts` sets `out: './src/migrations'`;
  `ls packages/db/src/migrations` → No such file or directory. Scripts exist
  in three places: root `package.json` (`"db:migrate": "turbo run db:migrate --filter=@repo/db"`),
  `turbo.json` (`"db:migrate": { "cache": false, "persistent": true }`), and
  `packages/db/package.json` (read it to find the exact script). The repo
  workflow is push-only (`db:push`), per README and AGENTS.md.

- **E.** `docs/mcp-improvements.md`: item 2 (atomic OAuth upsert) is fixed —
  `packages/db/src/queries/mcp/connections.ts` uses `onConflictDoUpdate` on
  `(serverId, userId)` everywhere; item 4 (IPv4-mapped IPv6 SSRF bypass) is
  fixed — `packages/validators/src/features/mcp/url.ts:49` uses
  `ipaddr.process(...)`, which normalizes `::ffff:` mapped addresses before
  `.range()`. Line 14's claim that guarded-fetch handles "response size caps,
  streaming byte limits" is false today and becomes true after sub-task A.
  The doc also cites pre-refactor paths (`packages/db/src/queries/mcp.ts`,
  `packages/utils/src/guarded-fetch.ts` for SSRF — SSRF checks now live in
  `packages/validators/src/features/mcp/url.ts`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun typecheck`          | exit 0              |
| Lint      | `bun check`              | exit 0              |
| Autofix   | `bun x ultracite fix .`  | exit 0              |
| Spelling  | `bun run check:spelling` | exit 0              |
| Dead code | `bun x knip --no-progress` | flagged items gone (knip needs `DATABASE_URL`; it errors on drizzle.config but still reports — match current behavior) |

## Scope

**In scope**:

- `packages/utils/src/guarded-fetch.ts`, `apps/bot/src/lib/mcp/guarded-fetch.ts`,
  `apps/bot/src/config.ts` (mcp section only)
- `apps/bot/package.json`, root `package.json`, `bun.lock` (via `bun install`)
- `lefthook.yml`
- `turbo.json`, `packages/db/package.json` (db:migrate removal only)
- `docs/mcp-improvements.md`, `AGENTS.md` (one sentence, sub-task D)

**Out of scope** (do NOT touch):

- The knip false positives listed above — removing them breaks tooling.
- The 11 unused exported types knip flags — deliberately excluded from this
  plan (several look like intentional API surface for the sandbox event
  protocol; deleting them needs the maintainer's call, recorded in
  plans/README.md as rejected-for-now).
- `packages/validators/src/features/mcp/url.ts` — the SSRF validation is
  correct; don't "improve" it here.
- `drizzle.config.ts` `out:` key and `db:generate` — keep; only `db:migrate`
  goes.

## Git workflow

- Branch: `advisor/006-quick-wins`
- One conventional commit per sub-task (messages given below)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step A: Response size cap in guarded fetch

In `packages/utils/src/guarded-fetch.ts`, extend the factory signature to
`createGuardedFetch({ timeoutMs, maxResponseBytes }: { timeoutMs: number; maxResponseBytes?: number })`.
After a successful `fetch`:

1. If `maxResponseBytes` is set and the `content-length` header parses to a
   number greater than the cap, cancel the body and throw
   `new Error('MCP response exceeded size limit')`.
2. If `maxResponseBytes` is set and the response has a body, wrap it in a
   counting `TransformStream<Uint8Array, Uint8Array>` whose `transform`
   accumulates `chunk.byteLength` and calls
   `controller.error(new Error('MCP response exceeded size limit'))` past the
   cap; return `new Response(wrappedBody, response)` so status/headers are
   preserved. When there is no body or no cap, return the response unchanged.

In `apps/bot/src/config.ts`, add a tunable next to `requestTimeoutMs` in the
`mcp` object (match the existing naming/units style — e.g.
`maxResponseBytes: 10 * 1024 * 1024`). In
`apps/bot/src/lib/mcp/guarded-fetch.ts`, pass it through.

Commit: `fix: enforce response size cap in guarded MCP fetch`

**Verify**: `bun typecheck` → exit 0; `bun check` → exit 0. If plan 001
landed, add `packages/utils/src/guarded-fetch.test.ts` — but note the function
validates URLs via DNS, so unit-testing the size cap requires injecting a
response; if that requires refactoring for testability, skip the test and say
so in the report (do not restructure the module for a test).

### Step B: Remove dead dependencies

1. Remove `"pino": "catalog:"` and `"pino-pretty": "catalog:"` from
   `apps/bot/package.json` dependencies. Do NOT remove them from
   `packages/logging/package.json`.
2. Remove the `"@types/pg"` and `"pg"` lines from the root `package.json`
   `workspaces.catalog`.
3. Run `bun install`.

Commit: `chore: drop unused pino/pino-pretty (bot) and pg catalog entries`

**Verify**: `bun install` exit 0; `bun typecheck` exit 0;
`grep -rn "from 'pg'\|from \"pg\"" apps packages` → no matches;
`bun dev:bot` starts and pretty-prints logs in dev (pino-pretty resolves from
`@repo/logging`) — if startup fails on a missing transport, STOP (see below).

### Step C: Pre-commit lint hook

Add to `lefthook.yml` (keep existing hooks unchanged):

```yaml
pre-commit:
  commands:
    ultracite:
      glob: "*.{ts,tsx,js,jsx,json,jsonc}"
      run: bun x ultracite check {staged_files}
```

Deliberately **not** running `typecheck` pre-commit (tsc over the monorepo is
too slow for a commit hook; CI covers it).

Commit: `chore: lint staged files pre-commit via lefthook`

**Verify**: `bun x lefthook run pre-commit` on a branch with a staged clean
`.ts` file → exit 0; stage a file with an obvious lint error (e.g. `var x = 1`)
→ non-zero, then revert the test file.

### Step D: Remove the broken db:migrate path

1. Delete the `db:migrate` script from root `package.json`.
2. Delete the `db:migrate` task from `turbo.json`.
3. Delete the `db:migrate` script from `packages/db/package.json` (verify its
   exact name there first).
4. In `AGENTS.md`, in the build-commands section, after the `db:push` line,
   add one sentence: schema changes ship via `bun run db:push` (push-only
   workflow — no migration files are generated or applied).

Commit: `chore: remove unused db:migrate path, document push-only workflow`

**Verify**: `grep -rn "db:migrate" package.json turbo.json packages/db/package.json` → no matches;
`bun typecheck` exit 0.

### Step E: Refresh docs/mcp-improvements.md

1. Item 2 (Atomic OAuth upsert): append
   `**Resolved:** implemented in packages/db/src/queries/mcp/connections.ts via onConflictDoUpdate on (serverId, userId).`
2. Item 4 (IPv4-mapped IPv6): append
   `**Resolved:** packages/validators/src/features/mcp/url.ts uses ipaddr.process(), which normalizes ::ffff: mapped addresses before range checks.`
3. Line 14: correct the capability claim to match reality after step A
   (timeout, redirect blocking, and response size cap live in
   `packages/utils/src/guarded-fetch.ts`; IP/SSRF validation lives in
   `packages/validators/src/features/mcp/url.ts`).
4. Update the priority list at the bottom: strike/mark items 1 (if plan 004
   landed), 2, and 4 as done.

Commit: `docs: mark resolved MCP improvement items, fix stale paths`

**Verify**: `bun run check:spelling` → exit 0.

## Test plan

Sub-task A optionally gets a unit test (see step A's caveat). B–E are
configuration changes verified by the per-step commands. No further tests.

## Done criteria

- [ ] `bun install`, `bun typecheck`, `bun check`, `bun run check:spelling`
      all exit 0
- [ ] `createGuardedFetch` enforces `maxResponseBytes` (header short-circuit +
      streaming count) and the bot passes a cap
- [ ] `pino`/`pino-pretty` absent from `apps/bot/package.json`; `pg`/`@types/pg`
      absent from the root catalog; `bun x knip --no-progress` no longer lists
      them
- [ ] `lefthook.yml` has the pre-commit ultracite hook
- [ ] No `db:migrate` references remain in the three manifests
- [ ] `docs/mcp-improvements.md` items 2 and 4 carry resolution notes
- [ ] Five commits, one per sub-task; no files outside the in-scope list
      modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- After step B, `bun dev:bot` fails to load the pino-pretty transport — bun's
  hoisting may differ from the audit's assumption; restore the two deps and
  report.
- `createGuardedFetch` has gained callers beyond
  `apps/bot/src/lib/mcp/guarded-fetch.ts`
  (`grep -rn "createGuardedFetch" apps packages`) — a second caller may not
  want the MCP cap default.
- `packages/db/src/migrations` exists by the time you run this (someone
  adopted migrations) — sub-task D inverts; report instead.

## Maintenance notes

- The 10 MiB cap is a guess at a sane ceiling; if a legitimate MCP tool
  (e.g. file fetch) hits it, raise the config value rather than removing the
  mechanism.
- If the team ever needs real migrations (multiple environments, destructive
  changes), reintroduce `db:generate` + `db:migrate` properly with a committed
  migrations dir — sub-task D's removal is about killing a half-wired path,
  not a position against migrations.
- Reviewer: in step A, check the no-cap and no-body code paths return the
  original `Response` untouched (streaming SSE transports must not be broken
  by an always-on wrapper).
