<div align="center">
  <img alt="Gorkie banner" src="./.github/banner.png" />
  <h1>Gorkie for Slack</h1>
</div>

Gorkie is a Slack AI agent. This repo is the v2 rewrite: Chat SDK owns Slack runtime behavior, AI SDK Harness/Pi owns the coding agent brain, and E2B provides the persistent per-thread sandbox.

## Stack

- Bun and TypeScript
- `vercel/chat` with `@chat-adapter/slack` in Socket Mode
- AI SDK 7 `HarnessAgent` with `@ai-sdk/harness-pi`
- E2B sandbox sessions
- PostgreSQL with Drizzle
- Turborepo and Ultracite

## Local Setup

Create a Slack app from [slack-manifest.json](slack-manifest.json), then install dependencies and fill the bot env file:

```bash
bun install
cp apps/bot/.env.example apps/bot/.env
```

Push the schema and start the bot:

```bash
bun run db:push
bun run dev:bot
```

Socket Mode is the expected local path, so Slack does not need a public HTTP URL for the bot.

## Checks

```bash
bun run typecheck
bun run check
bun run check:spelling
```

## Project Structure

```text
apps/
  bot/        Chat SDK Slack runtime, Slack features, bot-owned tools
packages/
  ai/         Harness/Pi agent core, prompts, provider attempts, session files
  db/         Drizzle schema, queries, database config
  logging/    Pino logger factory
  sandbox/    E2B sandbox provider and template builder
  utils/      Shared platform-neutral helpers
tooling/      Shared TypeScript, cspell, and GitHub config
```

`apps/server`, MCP OAuth, and recurring scheduled-task storage are deferred rewrite work. The core Slack thread agent runs from `apps/bot` directly with Bun.

## More

Read [AGENTS.md](AGENTS.md), [REWRITE_PLAN.md](REWRITE_PLAN.md), and [REWRITE_TODO.md](REWRITE_TODO.md) before changing architecture or rewrite priorities.

## License

MIT. See [LICENSE](LICENSE).
