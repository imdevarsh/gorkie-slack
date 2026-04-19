<h1 align="center">Gorkie (for Slack)</h4>

## 📋 Table of Contents

1. 🤖 [Introduction](#introduction)
2. 🚀 [Tech Stack](#tech-stack)
3. 📚 [Getting Started](#getting-started)
4. 🐳 [Running with Docker](#running-with-docker)
5. 📝 [License](#license)

## <a name="introduction">🤖 Introduction</a>

An AI assistant (called Gorkie) designed to help Slack users. Based on [Gork for Slack](https://github.com/techwithanirudh/gork-slack).

## <a name="tech-stack">🚀 Tech Stack</a>

This project was developed with the following technologies:

- [Vercel AI SDK][ai-sdk]
- [Exa][exa]
- [E2B][e2b]
- [PostgreSQL][postgres]
- [Redis][redis]
- [Slack Bolt SDK][slack-bolt]
- [TypeScript][ts]
- [Bun][bun]
- [Biome][biome]

## <a name="getting-started">📚 Getting Started</a>

First, create a new [Slack App](https://api.slack.com/apps) using the [provided manifest](slack-manifest.json). You will also need [Git][git], [Bun][bun], a running [Redis][redis] instance, and a [PostgreSQL][postgres] database.

```bash
# Clone this repository
$ git clone https://github.com/imdevarsh/gorkie-slack.git

# Install dependencies
$ bun install

# Copy and fill in your environment variables
$ cp .env.example .env

# Push the database schema
$ bun run db:push
```

```bash
# Start in development (watch mode)
$ bun run dev

# Start in production
$ bun run start
```

### E2B sandbox

The app uses an E2B sandbox (`gorkie-sandbox:latest`) and builds it automatically if missing. The template includes `fd`, `ripgrep`, `imagemagick`, `ffmpeg`, `pip`, and `pillow`.

## <a name="running-with-docker">🐳 Running with Docker</a>

Docker bundles the bot, Redis, and PostgreSQL together, no separate setup needed. The schema is pushed automatically on startup.

```bash
# Clone and enter the repo
$ git clone https://github.com/imdevarsh/gorkie-slack.git && cd gorkie-slack

# Copy and fill in your environment variables
$ cp .env.example .env

# Build and start
$ docker compose up -d

# View logs
$ docker compose logs -f gorkie

# Stop
$ docker compose down
```

> **Note:** When running with Docker, use the service names as hostnames in your `.env`:
> - `REDIS_URL=redis://redis:6379`
> - `DB_HOST=postgres` (the `DATABASE_URL` is constructed from the `DB_*` vars automatically)

## <a name="license">📝 License</a>

This project is under the MIT license. See the [LICENSE](LICENSE) for details.

[git]: https://git-scm.com/
[ts]: https://www.typescriptlang.org/
[slack-bolt]: https://docs.slack.dev/tools/bolt-js/
[biome]: https://biomejs.dev/
[ai-sdk]: https://ai-sdk.dev/
[bun]: https://bun.sh/
[exa]: https://exa.ai/
[e2b]: https://e2b.dev/
[redis]: https://redis.io/
[postgres]: https://www.postgresql.org/
