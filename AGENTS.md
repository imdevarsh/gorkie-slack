# Gorkie

A helpful AI agent for Slack (later other platforms). Ground-up **rewrite (v2)** in progress.

## Read first
- **`REWRITE_PLAN.md`** — architecture, core mechanics (sessions/`resumeState`), build phases,
  and the full code-quality rules. Follow it.
- The previous implementation is read-only at `/workspaces/worktrees/gorkie-slack/reference`
  (commit `d7ce686`). Understand *how* a hard piece was solved, then **re-derive cleanly** —
  never copy/paste old logic into the new framework. No old data needs preserving.

## When you don't know how something works
- **Read the source — don't guess.** The harness/pi, AI SDK 7, and `vercel/chat` are
  canary/under-documented. Clone and inspect, e.g.
  `git clone --depth 1 https://github.com/vercel/ai /tmp/ai`,
  `git clone --depth 1 https://github.com/vercel/chat /tmp/chat`,
  `https://github.com/earendil-works/pi`.
- **Use the skills** when a task touches their area: `ai-sdk`, `chat-sdk`, `slack-agent`,
  `coding-best-practices`, `ultracite`, `neon-postgres`. They carry current patterns.

## Stack
Bun · TypeScript · AI SDK 7 `HarnessAgent`+`pi` (brain, on host) · e2b (disposable sandbox) ·
`vercel/chat`+`@chat-adapter/slack` (Slack, socket mode) · Drizzle/Postgres · turborepo.

## Commands
```bash
bun install     bun dev        bun typecheck
bun check       bun fix        bun run check:spelling
bun run db:push  # push-only, no migration files
```
The skeleton may not typecheck until Phase 0–1 land — expected.

## Structure (target)
`apps/bot` (vercel/chat runtime) · `packages/{config, agent, sandbox` (to build)`, db,
validators, utils, logging}` · `tooling/{cspell, github, typescript}`.
MCP + `apps/server` are **Part 2** (deferred until the core thread agent works).

## Coding rules (full detail + examples in `REWRITE_PLAN.md` §12)
- **Inline over extract** — no one-shot helpers.
- **Avoid constants unless absolutely needed** — inline one-use literals and values.
- **Dict params** — >1 arg → single options object.
- **Small functions** — respect complexity/param limits; early returns over nesting.
- **No `as const`** on discriminants — annotate with the SDK type.
- **No type casts** to silence TS — parse/validate (zod) at boundaries.
- **No what-comments, no JSDoc** — comment only a non-obvious *why*.
- **Tuneables → `packages/config`**, never hardcoded.
- **Feature-enclosed** — group by owning feature; no re-export-only files.
- **Direct names**; delete dead wrappers instead of renaming.
- Run `bun fix` (Ultracite/Biome) before committing; `/coding-best-practices` when auditing.
