# gorkie-slack

A Slack AI assistant bot — monorepo rewrite using Turborepo.

Gorkie is a helpful AI bot that responds to mentions, DMs, and thread replies in Slack with AI-generated responses. It supports web search, code sandboxes, image generation, scheduled tasks, and more.

## Apps

| App | Description |
| --- | --- |
| `apps/bot` | The Slack bot (Bun + Slack Bolt SDK + Vercel AI SDK) |
| `apps/server` | Independent Hono server for proxy/API work |

## Packages

| Package | Description |
| --- | --- |
| `@repo/ai` | AI providers, model config, and system prompts |
| `@repo/db` | Drizzle ORM schema, queries, and Postgres client |
| `@repo/observability` | Shared Pino logger factory and logging env keys |
| `@repo/validators` | Shared Zod schemas |

## Tooling

| Package | Description |
| --- | --- |
| `@repo/tsconfig` | Shared TypeScript configs (`base.json`, `compiled-package.json`) |
| `@repo/cspell-config` | Shared spell-check config (cspell + dictionaries) |
| `@repo/github` | Reusable GitHub Actions setup action |

## Getting Started

```bash
bun install
```

Copy the example env files and fill in your secrets:

```bash
cp .env.example apps/bot/.env
# edit apps/bot/.env with your credentials

cp apps/server/.env.example apps/server/.env
```

Then start all apps in development mode:

```bash
bun dev
```

## Key Environment Variables

See `.env.example` at the repo root for a full annotated list. The most important ones for `apps/bot`:

| Variable | Description |
| --- | --- |
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-…`) |
| `SLACK_SIGNING_SECRET` | Signing secret from Slack app settings |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode (`xapp-…`) |
| `SLACK_SOCKET_MODE` | Set to `true` to use Socket Mode |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `HACKCLUB_API_KEY` | Primary AI inference key (`sk-hc-…`) |
| `OPENROUTER_API_KEY` | Fallback AI inference key (`sk-or-…`) |
| `EXA_API_KEY` | Web search via Exa |
| `E2B_API_KEY` | Code sandbox via E2B |
| `AGENTMAIL_API_KEY` | AgentMail API key (`am_…`) |
| `PROXY_BASE_URL` | Public URL for the independent proxy/server app |

The bot does not start or own the proxy server. Proxy/API work belongs in `apps/server`; the bot only receives `PROXY_BASE_URL` and optional `PROXY_API_KEY` so sandbox code can call the independent service.

## Available Scripts

| Script | Description |
| --- | --- |
| `bun dev` | Start all apps in watch mode |
| `bun build` | Build all apps and packages |
| `bun typecheck` | Type-check the entire monorepo |
| `bun check` | Lint and format check (Ultracite) |
| `bun fix` | Auto-fix lint and formatting issues |
| `bun run check:spelling` | Spell-check with cspell |
| `bun run db:push` | Push schema to database |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run pending migrations |
| `bun run db:studio` | Open Drizzle Studio |
