# Gorkie

Gorkie is an AI assistant for Slack. The codebase is a Bun/TypeScript monorepo using Chat SDK, AI SDK Harness/Pi, E2B, Drizzle/Postgres, Turborepo, and Ultracite.

## Mental Model

Each Slack conversation runs an AI SDK 7 `HarnessAgent` driving the `pi` coding agent.

The HarnessAgent/Pi brain runs on the bot host machine, not in the sandbox. Model keys, BYOK secrets, future MCP credentials, prompt assembly, Slack tools, and the agent loop all live on the host.

Each conversation gets its own persistent E2B sandbox. The sandbox is remote Linux for filesystem and shell work: Pi's `bash`, `read`, `write`, and `edit` tools execute there, but Pi itself never runs inside it.

## When Unsure

- Read source before guessing. Harness/Pi, AI SDK 7, and Chat SDK are canary or under-documented.
- Use the relevant skills when a task touches their area: `ai-sdk`, `chat-sdk`, `ultracite`, `neon-postgres`.
- Clone and inspect upstream source when local docs are not enough:
  - AI SDK/Harness/Pi: `https://github.com/vercel/ai`
  - Chat SDK: `https://github.com/vercel/chat`
  - Pi internals when needed: `https://github.com/earendil-works/pi`
- Docs and architecture: start in `docs/index.md`.
- Cleanup tracker: `REWRITE_TODO.md`.
- Long-form build plan and coding examples: `REWRITE_PLAN.md`.

## Where Things Belong

- `apps/bot`: chat runtime, Slack routing, Slack features, stop controls, line replies, task rendering, and bot-owned host tools.
- `packages/ai`: platform-neutral agent construction, Pi attempts, prompts, request hint types, and session persistence.
- `packages/sandbox`: E2B sandbox provider, sandbox session adapter, template builder, and vendored skills.
- `packages/db`: Drizzle schema, Postgres client, and app-owned queries.
- `docs`: Markdown architecture docs for humans and agents.

## Boundaries

- Never: put Slack-only behavior in `packages/ai`.
- Never: put model keys, Slack tokens, or future MCP secrets in the sandbox.
- Never: make Slack transcript storage the agent memory. Harness/Pi session history is the durable agent history.
- Never: add one-use constants, wrappers, helpers, or re-export-only files.
- Never: commit secrets or tracked throwaway scripts.
- Ask first: dependency changes, broad schema changes, destructive git operations, or anything that changes deployment shape.
- Prefer: feature-owned files and direct names over compatibility wrappers.

## Coding Rules

Full detail and examples live in `REWRITE_PLAN.md`.

- Inline over extract: no one-shot helpers.
- Avoid constants unless absolutely needed: inline one-use literals and values.
- Dict params: functions with more than one parameter take a single options object.
- Small functions: prefer early returns over nesting; respect complexity and parameter limits.
- No `as const` on discriminants: annotate with the SDK type.
- No type casts to silence TypeScript: parse or validate with Zod at boundaries.
- No what-comments, no JSDoc: comment only a non-obvious why.
- Tuneables belong in the owning app/package config, never scattered call-site literals.
- Feature-enclosed: Slack features live under `apps/bot/src/slack/features/<name>/`.
- Direct names: delete dead wrappers instead of renaming them.

## Validation

Before handoff after code changes:

1. `bun run typecheck`
2. `bun run check`
3. `bun run check:spelling`
4. `bun run check:knip`

For docs-only changes, `bun run check` and `bun run check:spelling` are usually enough.

For cleanup, dependency, package export, or file-move work, run `bun run check:knip`.

Before committing:

1. `git status --short`
2. `git diff --stat`
3. Run the relevant checks above.
