---
title: Development
description: Commands, local runtime, template builds, checks, and reference repos.
---

Gorkie runs as a long-lived Bun process from `apps/bot`. It uses Slack Socket Mode, so local development does not need a public webhook URL.

## Prerequisites

- Bun
- PostgreSQL
- a Slack app created from `slack-manifest.json`
- an E2B API key
- provider keys for the configured Pi attempts
- an Exa API key

## Local Run

```sh
bun install
cp apps/bot/.env.example apps/bot/.env
bun run db:push
bun run dev:bot
```

Fill `apps/bot/.env` with Slack, database, provider, E2B, Exa, and optional Langfuse values. Do not commit secrets.

## Checks

```sh
bun run typecheck
bun run check
bun run check:spelling
bun run check:knip
```

`bun run fix` applies safe Ultracite/Biome fixes. `bun run check:knip` catches unused files, exports, and dependencies after cleanup work.

## Docs Preview

The docs live in `docs/` as Markdown with Fumadocs-compatible frontmatter.

```sh
bun run docs:preview
```

## Sandbox Template

Build the E2B template when sandbox runtime dependencies change:

```sh
bun run build:template
```

The template installs the runtime environment used by every sandbox: Linux packages, Node, Python packages, browser dependencies, and CLIs used by skills.

## Reference Source

When behavior is unclear, inspect upstream source:

| Topic | Upstream source |
| --- | --- |
| Chat routing and subscriptions | `vercel/chat` |
| Chat tools and StreamingPlan | `vercel/chat` |
| HarnessAgent lifecycle | `vercel/ai` |
| Pi harness adapter | `vercel/ai` |
