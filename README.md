<div align="center">
  <img alt="Gorkie banner" src="./.github/banner.png" />
  <h1>Gorkie for Slack</h1>
</div>

Gorkie is a helpful AI Slack bot built with Bun, TypeScript, Vercel AI SDK, and Slack Bolt SDK. It responds to mentions, DMs, and thread replies with AI-generated responses, web search, code sandbox work, image generation, scheduled tasks, and Slack-aware tools.

## Tech Stack

| Area | Details |
| --- | --- |
| Slack bot | Slack Bolt SDK, Socket Mode or HTTP receiver |
| AI | Vercel AI SDK, Hack Club AI, OpenRouter fallback, Gemini fallback |
| Sandbox | E2B sandboxes running Pi agent tooling |
| Search | Exa web search |
| Data | PostgreSQL with Drizzle ORM |
| Cache/KV | Redis client package ready under `@repo/kv` |
| Proxy | Hono server for sandbox provider-key proxying |
| Runtime | Bun |
| Quality | Ultracite/Biome, cspell, lefthook, GitHub Actions |

## Apps

| App | Description |
| --- | --- |
| `apps/bot` | Slack bot runtime and bot-owned integrations |
| `apps/server` | Independent Hono proxy/API server |

The bot does not start or import the proxy server. It writes short-lived DB-backed sandbox proxy tokens directly, then passes `PROXY_BASE_URL` and the scoped token into the sandbox. Provider keys stay in `apps/server`.

## Packages

| Package | Description |
| --- | --- |
| `@repo/ai` | AI providers, model config, prompt builders, tool metadata |
| `@repo/db` | Drizzle schema, PostgreSQL client, query modules |
| `@repo/kv` | Redis env and client factory |
| `@repo/logging` | Shared Pino logger factory and logging env keys |
| `@repo/utils` | Shared framework-agnostic helpers |
| `@repo/validators` | Shared Zod schemas |
| `tooling/*` | Shared TypeScript, cspell, and GitHub Action config |

## Setup

```bash
bun install
cp apps/bot/.env.example apps/bot/.env
cp apps/server/.env.example apps/server/.env
```

Fill the env files, then push the database schema:

```bash
bun run db:push
```

Run both apps:

```bash
bun dev
```

Useful focused commands:

```bash
bun run dev:bot
bun run dev:server
bun run build
bun run check
bun run typecheck
bun run check:spelling
```

## Environment

`apps/bot/.env.example` contains bot-owned variables: Slack tokens, AI keys, Exa, E2B, AgentMail, database, logging, and the sandbox proxy URL.

`apps/server/.env.example` contains proxy-owned variables: database, CORS, logging, and upstream provider keys.

## Docs

- [Sandbox proxy](./docs/proxy.md)
- [Package strategy](./docs/packages.md)
