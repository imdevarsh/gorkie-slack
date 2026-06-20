<div align="center">
  <img alt="Gorkie banner" src="./.github/banner.png" />
  <h1>Gorkie for Slack</h1>
</div>

## Table of Contents

1. [Introduction](#introduction)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Getting Started](#getting-started)
5. [Project Structure](#project-structure)
6. [Development](#development)
7. [License](#license)

## Introduction

Gorkie is an AI assistant for Slack. It responds in mentions, DMs, Assistant
threads, and subscribed Slack threads with answers backed by tools, sandboxed
code execution, web search, Slack context, file uploads, image generation, and
reminders.

The bot runs as a long-lived Bun process. Slack events are handled through
[Vercel Chat SDK][chat-sdk] and the Slack adapter in Socket Mode, while coding
agent work runs through [Vercel AI SDK][ai-sdk] Harness/Pi. Each active Slack
conversation gets an [E2B][e2b] sandbox so Gorkie can run commands, inspect
files, generate artifacts, and upload results back to Slack.

## Features

- Slack-native replies for mentions, DMs, Assistant threads, and thread follow-ups.
- Per-thread sandbox sessions backed by E2B.
- Coding-agent workflows through AI SDK Harness/Pi.
- Slack-aware tools for reading public channel/thread history, posting messages,
  looking up users/channels, and reacting to messages.
- Web search through Exa.
- Image generation and file uploads back into the active Slack thread.
- Mermaid diagram generation.
- Scheduled Slack reminders.
- App Home customization for user instructions and presets.
- Langfuse/OpenTelemetry tracing hooks for runtime visibility.

## Tech Stack

- [Bun][bun] and TypeScript
- [Vercel Chat SDK][chat-sdk] with `@chat-adapter/slack`
- [Vercel AI SDK][ai-sdk] `HarnessAgent` with `@ai-sdk/harness-pi`
- [E2B][e2b] sandbox sessions
- [PostgreSQL][postgres] + [Drizzle ORM][drizzle]
- [Exa][exa]
- [Langfuse][langfuse] + [OpenTelemetry][otel]
- [Turborepo][turbo]
- [Ultracite][ultracite]

## Getting Started

Create a new [Slack app](https://api.slack.com/apps) using the
[provided manifest](slack-manifest.json). You will also need [Git][git],
[Bun][bun], a [PostgreSQL][postgres] database, an [E2B][e2b] API key, and model
provider keys for the configured Harness/Pi attempts.

```bash
# Clone this repository
git clone https://github.com/imdevarsh/gorkie-slack.git

# Install dependencies
bun install

# Copy and fill in the bot environment
cp apps/bot/.env.example apps/bot/.env

# Push the database schema
bun run db:push

# Start the Slack bot
bun run dev:bot
```

Local development uses Slack Socket Mode, so the bot does not need a public HTTP
tunnel just to receive Slack events.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full local setup, sandbox template
notes, and deployment guidance.

## Project Structure

```text
apps/
  bot/        Slack runtime, Chat SDK wiring, Slack features, bot-owned tools
docs/         Human/agent-readable architecture notes
packages/
  ai/         Harness/Pi agent setup, prompts, provider attempts, session files
  db/         Drizzle schema, PostgreSQL client, queries
  logging/    Pino logger factory
  sandbox/    E2B sandbox provider, template builder, sandbox skills
  utils/      Shared framework-agnostic helpers
tooling/
  cspell/     Shared cspell configuration
  github/     Reusable GitHub Actions setup
  typescript/ Shared TypeScript configs
```

`apps/bot` is the production runtime. It runs TypeScript directly with Bun and
keeps Slack Socket Mode, Chat SDK state, Harness/Pi sessions, and E2B sandbox
coordination in one process.

## Development

Use these checks before handing off changes:

```bash
bun run typecheck
bun run check
bun run check:spelling
```

Build everything with:

```bash
bun run build
```

Build the sandbox template when sandbox tools, skills, browser dependencies, or
CLI packages change:

```bash
bun run build:template
```

Manual Slack smoke testing is documented in [TESTING.md](TESTING.md).

Architecture notes live in [docs/](docs/). Preview them with:

```bash
bun run docs:preview
```

## License

This project is under the MIT license. See [LICENSE](LICENSE) for details.

[git]: https://git-scm.com/
[bun]: https://bun.sh/
[chat-sdk]: https://chat-sdk.dev/
[ai-sdk]: https://ai-sdk.dev/
[e2b]: https://e2b.dev/
[postgres]: https://www.postgresql.org/
[drizzle]: https://orm.drizzle.team/
[exa]: https://exa.ai/
[langfuse]: https://langfuse.com/
[otel]: https://opentelemetry.io/
[turbo]: https://turbo.build/
[ultracite]: https://www.ultracite.ai/
