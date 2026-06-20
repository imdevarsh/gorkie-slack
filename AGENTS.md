# Gorkie

A helpful AI agent for Slack (later other platforms).

## Core mental model

Each Slack thread runs an AI SDK 7 `HarnessAgent` driving the `pi` coding agent.
**The HarnessAgent/Pi brain runs on the bot host machine, not in the sandbox.** Model
keys, BYOK secrets (future), MCP credentials, prompt assembly, Slack tools, and the agent
loop all live on the host. Each thread gets its own persistent **E2B sandbox** (remote
Linux) used only for filesystem and shell — Pi's `bash`/`read`/`write`/`edit` execute
there, but Pi itself never runs inside it.

## When you don't know how something works

- **Read the source — don't guess.** `harness`/`pi`, AI SDK 7, and `vercel/chat` are
  canary/under-documented. Clone and inspect:
  - `git clone --depth 1 https://github.com/vercel/ai /tmp/ai`
  - `git clone --depth 1 https://github.com/vercel/chat /tmp/chat`
  - `https://github.com/earendil-works/pi`
- **Use the skills** when a task touches their area: `ai-sdk`, `chat-sdk`, `slack-agent`,
  `coding-best-practices`, `ultracite`, `neon-postgres`. They carry current patterns.
- **Architecture docs** live in `docs/` as Markdown with Fumadocs-compatible
  components for humans and agents.
- **Design + roadmap:** `REWRITE_PLAN.md` (architecture, core mechanics, build plan, full
  coding rules) and `REWRITE_TODO.md`.

## Stack

Bun · TypeScript · AI SDK 7 `HarnessAgent`+`pi` (brain, on host) · e2b (persistent sandbox
workspace) · `vercel/chat`+`@chat-adapter/slack` (Slack, Socket Mode) · Drizzle/Postgres ·
turborepo.

## Structure

- `apps/bot` — `vercel/chat` Slack runtime, Slack features, host-owned tools
- `docs/` — human/agent-readable architecture docs
- `packages/{ai,sandbox,db,logging,utils}` — agent core, E2B provider, schema, logger, helpers
- `tooling/{cspell,github,typescript}` — shared config

## Hard boundaries

- Do not put Slack-only behavior in `packages/ai`.
- Do not put model keys, Slack tokens, or future MCP secrets in the sandbox.
- Do not make Slack transcript storage the agent memory. Harness/Pi session history is the durable agent history.
- Do not add a new abstraction unless it removes real complexity.

## Commands

```bash
bun install      bun dev        bun typecheck
bun check        bun fix
bun run db:push  # push-only, no migration files
```

## Coding rules (full detail + examples in `REWRITE_PLAN.md` §12)

- **Inline over extract** — no one-shot helpers.
- **Avoid constants unless absolutely needed** — inline one-use literals and values.
- **Dict params** — >1 arg → single options object.
- **Small functions** — early returns over nesting; respect complexity/param limits.
- **No `as const`** on discriminants — annotate with the SDK type.
- **No type casts** to silence TS — parse/validate (zod) at boundaries.
- **No what-comments, no JSDoc** — comment only a non-obvious *why*.
- **Tuneables → owning app/package config**, never scattered call-site literals.
- **Feature-enclosed** — Slack features under `apps/bot/src/slack/features/<name>/`.
- **Direct names** — delete dead wrappers instead of renaming.

Run `bun fix` (Ultracite/Biome) before committing; use `/coding-best-practices` when auditing.
