<div align="center">
  <img alt="Gorkie banner" src="./.github/banner.png" />
  <h1>Gorkie (for Slack)</h1>
</div>

## Table of Contents

1. [Introduction](#introduction)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Project Structure](#project-structure)
5. [License](#license)

## Introduction

An AI assistant (called Gorkie) designed to help Slack users. Based on [Gork for Slack](https://github.com/techwithanirudh/gork-slack).

Gorkie responds to mentions, DMs, and thread replies with AI-generated responses, including web search, code sandboxes, image generation, scheduled tasks, and Slack-aware tools.

## Tech Stack

- [Vercel AI SDK][ai-sdk]
- [Slack Bolt SDK][slack-bolt]
- [Exa][exa]
- [E2B][e2b]
- [PostgreSQL][postgres] + [Drizzle ORM][drizzle]
- [Redis][redis]
- [Bun][bun]
- [Turborepo][turbo]
- [Biome][biome]

## Getting Started

Create a new [Slack App](https://api.slack.com/apps) using the [provided manifest](slack-manifest.json). You will also need [Git][git], [Bun][bun], and a [PostgreSQL][postgres] database.

```bash
# Clone this repository
git clone https://github.com/imdevarsh/gorkie-slack.git

# Install dependencies
bun install

# Copy and fill in your environment variables
cp apps/bot/.env.example apps/bot/.env
cp apps/server/.env.example apps/server/.env

# Push the database schema
bun run db:push
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full local setup, including the proxy tunnel required for E2B sandboxes.

## Project Structure

```
apps/
  bot/        Slack bot (entry: src/index.ts)
  server/     Nitro proxy for AI provider keys
packages/
  ai/         AI providers, model config, prompts
  db/         Drizzle schema, PostgreSQL client, queries
  kv/         Redis env and client factory
  logging/    Pino logger factory
  utils/      Shared framework-agnostic helpers
  validators/ Shared Zod schemas
tooling/      Shared TypeScript, cspell, GitHub Action config
```

The bot does not start or import the proxy server. It creates short-lived DB-backed tokens and passes `SERVER_BASE_URL` plus the scoped token into the sandbox. Provider keys stay in `apps/server`.

## License

This project is under the MIT license. See [LICENSE](LICENSE) for details.

[git]: https://git-scm.com/
[bun]: https://bun.sh/
[slack-bolt]: https://docs.slack.dev/tools/bolt-js/
[ai-sdk]: https://ai-sdk.dev/
[exa]: https://exa.ai/
[e2b]: https://e2b.dev/
[postgres]: https://www.postgresql.org/
[drizzle]: https://orm.drizzle.team/
[redis]: https://redis.io/
[turbo]: https://turbo.build/
[biome]: https://biomejs.dev/
