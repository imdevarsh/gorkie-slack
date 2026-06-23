# Development

Gorkie runs as one local app: `apps/bot`.

The bot uses Chat SDK with the Slack adapter in Socket Mode, so local development does not need a public tunnel. AI work runs through AI SDK Harness/Pi and each active Slack thread gets an E2B sandbox.

## Prerequisites

- Bun
- PostgreSQL
- A Slack app created from `slack-manifest.json`
- An E2B API key
- Provider keys for the configured Pi attempts

## Environment

Create the bot env file:

```bash
cp apps/bot/.env.example apps/bot/.env
```

Fill in Slack, database, provider, E2B, Exa, and optional Langfuse values. `SLACK_SOCKET_MODE=true` is the normal local setting.

## Running Locally

Install dependencies, push the schema, then start the bot:

```bash
bun install
bun run db:push
bun run dev:bot
```

The bot runs TypeScript directly with Bun. Dev mode uses process-restart watch, not Bun hot reload, because Slack Socket Mode owns a persistent WebSocket that must shut down cleanly between reloads. Do not add bot bundling or `tsdown` unless there is a real deployment target that needs it.

## Sandbox Template

Build the E2B template when sandbox packages or CLI dependencies change:

```bash
bun --filter=@repo/sandbox run build:template
```

The template installs runtime tools such as Node, Python packages, `agent-browser`, browser dependencies, and upstream skill files. If Pi does not discover template-installed skills, investigate the adapter's skill discovery roots before adding app-owned skill copies.

## Checks

```bash
bun run typecheck
bun run check
bun run check:spelling
```

Run `bun run fix` before preparing a commit.

## Deployment Notes

`apps/bot` is a long-lived process and should run on a persistent host. Configure the same variables as `apps/bot/.env.example` in the host environment and keep Socket Mode enabled unless the Slack runtime is explicitly moved to HTTP events.
