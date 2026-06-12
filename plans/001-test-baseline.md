# Plan 001: Establish a test baseline (bun:test + turbo task + CI job + first unit tests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7e2862a..HEAD -- packages/utils apps/bot/src/lib/mcp/format-tool-name.ts package.json turbo.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `7e2862a`, 2026-06-12

## Why this matters

This repo has **zero test files, no test script, no turbo test task, and no CI
test job** (verified: `package.json` scripts, `turbo.json` tasks, the four jobs
in `.github/workflows/ci.yml` are build/lint/typecheck/spelling only). Every
other plan in `plans/` involves changing state-machine or data-layer logic with
no safety net. This plan installs the cheapest possible verification baseline:
Bun's built-in test runner (zero new dependencies — the runtime is already
Bun), a turbo task, a CI job, and a first set of unit tests over pure functions
that need no database, network, or Slack mocks.

## Current state

- `package.json` (repo root) — scripts block at lines 43–66 has `typecheck`,
  `check`, `fix`, etc., but no `test`.
- `turbo.json` — `tasks` has `build`, `lint`, `typecheck`, `dev`, `clean`,
  `db:*`; no `test`.
- `.github/workflows/ci.yml` — four jobs (`build`, `ultracite`, `types`,
  `spelling`), each: checkout → `uses: ./tooling/github/setup` → one `bun run`
  command. The setup action writes `.env` files for both apps, so env
  validation passes in CI.
- `packages/utils/package.json` — scripts are only `clean` and `typecheck`.
  Exports are per-file (`./text`, `./record`, etc.). `@types/bun` is already a
  devDependency (so `bun:test` types resolve).
- `apps/bot/package.json` — scripts: `clean`, `build`, `build:sandbox`, `dev`,
  `start`, `typecheck`.
- There are no `*.test.ts` files anywhere in the repo.

Functions to test in this plan (all pure, all verified to exist at the planned
commit):

`packages/utils/src/text.ts:29–41`:

```ts
export function clampText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (maxLength <= 0) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}
```

`packages/utils/src/record.ts:1–6`:

```ts
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}
```

Note: `asRecord([])` currently returns the array (arrays are objects). That is
the **current behavior** — write a characterization test documenting it; do NOT
change `record.ts` in this plan.

`packages/utils/src/secret.ts` — `encryptSecret`/`decryptSecret`, AES-256-GCM,
output format `v1:<iv>:<tag>:<ciphertext>` (base64url). `decryptSecret` throws
`Error('Unsupported encrypted secret format')` when the string doesn't split
into those four parts.

`apps/bot/src/lib/mcp/format-tool-name.ts` (entire file):

```ts
export function formatToolName(name: string): string {
  return name
    .split(/[_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

Repo conventions that apply:

- Code style is enforced by Ultracite/Biome — run `bun x ultracite fix .`
  before committing; `bun check` must pass.
- Per `.claude/CLAUDE.md` testing guidance: assertions inside `it()`/`test()`
  blocks, no done-callbacks, no `.only`/`.skip`, keep describe nesting flat.
- Commit messages are conventional commits (recent examples:
  `feat: flat list below 40 tools, accordion above`, `fix: views.update hash chaining...`).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Install   | `bun install`                            | exit 0              |
| Typecheck | `bun typecheck`                          | exit 0              |
| Lint      | `bun check`                              | exit 0              |
| Autofix   | `bun x ultracite fix .`                  | exit 0              |
| Spelling  | `bun run check:spelling`                 | exit 0              |
| Tests     | `bun test` (inside a workspace dir)      | "N pass, 0 fail"    |

## Scope

**In scope** (the only files you should create or modify):

- `packages/utils/package.json` (add `test` script)
- `apps/bot/package.json` (add `test` script)
- `package.json` (root — add `test` script)
- `turbo.json` (add `test` task)
- `.github/workflows/ci.yml` (add `test` job)
- `packages/utils/src/text.test.ts` (create)
- `packages/utils/src/record.test.ts` (create)
- `packages/utils/src/secret.test.ts` (create)
- `apps/bot/src/lib/mcp/format-tool-name.test.ts` (create)
- `.cspell.jsonc` or `tooling/cspell/**` ONLY if `check:spelling` flags a word
  used in the new test files

**Out of scope** (do NOT touch):

- `packages/utils/src/record.ts`, `text.ts`, `secret.ts`,
  `format-tool-name.ts` — this plan adds tests only; no production code changes
  even if a test reveals surprising behavior (document it in the test name).
- `lefthook.yml` — pre-commit hooks are plan 006.
- Anything involving the database, Slack, or MCP clients.

## Git workflow

- Branch: `advisor/001-test-baseline` (branch off the current branch's base or
  `main`; do not commit to `main` directly)
- Conventional commits, e.g. `test: add bun test baseline and first unit tests`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add test scripts and the turbo task

1. In `packages/utils/package.json` scripts, add: `"test": "bun test"`.
2. In `apps/bot/package.json` scripts, add: `"test": "bun test"`.
3. In root `package.json` scripts, add: `"test": "turbo run test"`.
4. In `turbo.json` `tasks`, add:

```json
"test": {}
```

Do NOT add a `test` script to workspaces that have no test files — `bun test`
exits non-zero when it finds no tests, which would break `turbo run test`.

**Verify**: `bun typecheck` → exit 0 (nothing should change);
`cd packages/utils && bun test` → exits non-zero with "no tests found" (or
similar) since tests don't exist yet — that confirms wiring; tests come next.

### Step 2: Write `packages/utils/src/text.test.ts`

Use `import { describe, expect, test } from 'bun:test';` and
`import { clampText, cleanText, trimmed } from './text';`.

Cases to cover (derive expectations from the excerpt above — these are the
correct values, verify them against the source before asserting):

- `clampText('hello world', 100)` → `'hello world'` (no truncation)
- `clampText('hello world', 5)` → `'he...'` (slice(0, 2) + '...')
- `clampText('hello', 0)` → `''`
- `clampText('hello', 3)` → `'hel'` (maxLength ≤ 3: bare slice, no ellipsis)
- `clampText('  a\n\n b  ', 100)` → `'a b'` (whitespace normalization)
- `cleanText` strips control characters but keeps newlines? Check the source:
  `cleanText` removes `\r`, `\x00–\x08`, `\x0b`, `\x0c`, `\x0e–\x1f`,
  `\x7f–\x9f`; `\n` (0x0a) is NOT removed. Assert
  `cleanText('a\x07b\nc')` → `'ab\nc'`.
- `trimmed('  x  ')` → `'x'`; `trimmed('   ')` → `undefined`;
  `trimmed(42)` → `undefined`.

**Verify**: `cd packages/utils && bun test text` → all pass.

### Step 3: Write `packages/utils/src/record.test.ts`

- `asRecord({ a: 1 })` → returns the object
- `asRecord(null)` → `null`; `asRecord(undefined)` → `null`;
  `asRecord('x')` → `null`; `asRecord(7)` → `null`
- Characterization: `asRecord([1, 2])` currently returns the array (not null).
  Name the test so the quirk is explicit, e.g.
  `test('characterization: arrays pass through (known quirk)', ...)`.

**Verify**: `cd packages/utils && bun test record` → all pass.

### Step 4: Write `packages/utils/src/secret.test.ts`

- Round-trip: `decryptSecret({ encrypted: encryptSecret({ plaintext: 'hello', secret: 's'.repeat(32) }), secret: 's'.repeat(32) })` → `'hello'`
- Distinct IVs: two encryptions of the same plaintext produce different strings.
- Wrong secret throws (GCM auth failure — assert `expect(() => ...).toThrow()`).
- Malformed input: `decryptSecret({ encrypted: 'not-valid', secret: '...' })`
  throws `'Unsupported encrypted secret format'`.
- Tampering: flip a character in the ciphertext segment and assert it throws.

Never use a real secret value — use obvious test constants only.

**Verify**: `cd packages/utils && bun test secret` → all pass.

### Step 5: Write `apps/bot/src/lib/mcp/format-tool-name.test.ts`

- `formatToolName('list_meetings')` → `'List Meetings'`
- `formatToolName('read-file')` → `'Read File'`
- `formatToolName('a__b--c')` → `'A B C'`
- `formatToolName('single')` → `'Single'`
- `formatToolName('')` → `''`
- Characterization: camelCase is not split — `formatToolName('getSummary')` →
  `'GetSummary'`.

**Verify**: `cd apps/bot && bun test format-tool-name` → all pass.
Note: this file imports nothing with env side effects (verify the import graph
stays empty if you add imports). If running it triggers env validation errors,
STOP — see STOP conditions.

### Step 6: Add the CI job

In `.github/workflows/ci.yml`, add a job mirroring the existing four:

```yaml
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout branch
        uses: actions/checkout@v4

      - name: Setup
        uses: ./tooling/github/setup

      - name: Run tests
        run: bun run test
```

**Verify**: `bun run test` locally from the repo root → turbo runs `test` in
`@repo/utils` and `bot`, all pass, exit 0.

### Step 7: Lint, spelling, full gate

Run `bun x ultracite fix .`, then `bun check`, `bun typecheck`,
`bun run check:spelling`, `bun run test`.

**Verify**: all exit 0. If cspell flags a legitimate word from the tests
(e.g. `ciphertext` variants), add it to the cspell config under `tooling/cspell`
following the existing dictionary structure.

## Test plan

This plan IS the test plan: 4 new test files, ~20 assertions, covering
`clampText`/`cleanText`/`trimmed`, `asRecord` (incl. the array
characterization), `encryptSecret`/`decryptSecret` (round-trip, tamper,
format), and `formatToolName`. There is no existing test to model after; these
files become the repo's structural pattern.

## Done criteria

- [ ] `bun run test` exits 0 from the repo root; ≥ 4 test files, all passing
- [ ] `bun typecheck` exits 0
- [ ] `bun check` exits 0
- [ ] `bun run check:spelling` exits 0
- [ ] `.github/workflows/ci.yml` contains a `test` job using `./tooling/github/setup`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `bun test` cannot run in this Bun version/workspace layout (e.g. workspace
  resolution errors importing `./text`).
- Importing `format-tool-name.ts` in a test transitively triggers env
  validation (it shouldn't — the file has no imports — but if someone added
  one, do not stub env; report).
- Any assertion in steps 2–5 contradicts the actual source behavior — re-read
  the source, fix the expectation to match reality (tests characterize, they
  don't legislate), and note the discrepancy in your report.

## Maintenance notes

- Plans 002/003/005/007 reference this infrastructure for their own tests;
  keep test files colocated next to sources (`foo.test.ts` beside `foo.ts`).
- DB-backed queries (`packages/db`) intentionally have no tests yet — that
  needs a test-database harness and is explicitly deferred; don't bolt mocks
  onto these unit tests.
- Reviewer should check that no `.only`/`.skip` slipped in and that the two
  characterization tests (array pass-through, camelCase) are labeled as such.
