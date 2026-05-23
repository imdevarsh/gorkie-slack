# Development

Gorkie runs as two local apps:

- `apps/bot` is the Slack bot.
- `apps/server` is the Nitro proxy that holds provider API keys.

The bot does not start or import the proxy server. For sandbox work, E2B must be able to reach `apps/server` through a public URL.

## Prerequisites

- Bun
- PostgreSQL
- A Slack app created from `slack-manifest.json`
- An E2B API key
- Provider API keys for the proxy in `apps/server/.env`

Redis is optional right now. Keep `REDIS_URL` unset unless a feature imports `@repo/kv`.

## Environment Files

Create both app env files:

```bash
cp apps/bot/.env.example apps/bot/.env
cp apps/server/.env.example apps/server/.env
```

Use the same `DATABASE_URL` in both files. The bot writes short-lived proxy tokens to the database, and the proxy validates those tokens from the same database.

Put Slack, Exa, E2B, AgentMail, Langfuse, and `PROXY_BASE_URL` in `apps/bot/.env`.

Both apps need `HACKCLUB_API_KEY`, `OPENROUTER_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY`: the bot uses them for direct orchestrator inference, the proxy uses them to forward sandbox requests upstream.

## Running Locally

Install dependencies and push the schema:

```bash
bun install
bun run db:push
```

The bot and proxy run in separate terminals. E2B sandboxes are external processes, so the proxy must be reachable over a public URL. `localhost` is not sufficient.

Start the proxy in one terminal:

```bash
bun run dev:server
```

In a second terminal, expose the proxy with a public tunnel:

```bash
npx untun@latest tunnel http://localhost:3001
```

Copy the printed `https://...trycloudflare.com` URL into `apps/bot/.env` as `PROXY_BASE_URL`. It must point at the server root. The sandbox config appends paths like `/provider/hackclub` and calls `/ip` to resolve the sandbox outbound IP.

In a third terminal, start the bot:

```bash
bun run dev:bot
```

If you change `PROXY_BASE_URL`, restart the bot to pick it up.

`SLACK_SOCKET_MODE=true` is the simplest setup for local Slack development. Slack does not need to reach your bot over HTTP.

To test the production build locally, build first and then use `start:bot`:

```bash
bun run build --filter=bot
bun run start:bot
```

This runs with `NODE_ENV=production`, so logs are written as plain JSON to stdout and to a timestamped file under `apps/bot/logs/`.

## Common Checks

```bash
bun run typecheck
bun check
bun run check:spelling
```

## Deployment

### Proxy (`apps/server`) to Vercel

The proxy is a Nitro app and deploys to Vercel as a serverless Node.js function.

1. Import the repo in the Vercel dashboard. Set the **Root Directory** to `apps/server` and the **Framework Preset** to **Other**.

2. Add environment variables in the Vercel project settings, everything from `apps/server/.env.example`:

   | Variable | Notes |
   |---|---|
   | `DATABASE_URL` | Same Neon connection string as the bot |
   | `HACKCLUB_API_KEY` | Provider key (never put in the bot) |
   | `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` | Optional fallback |
   | `GOOGLE_GENERATIVE_AI_API_KEY` | Optional fallback |
   | `CORS_ORIGIN` | Your bot's public URL, or `*` to allow all origins |
   | `LOG_LEVEL` | `info` for production |

3. Deploy. The proxy URL will be `https://<your-project>.vercel.app`.

4. Set that URL as `PROXY_BASE_URL` in `apps/bot/.env` (and in your bot's production environment).

The `/health` and `/ip` endpoints have no auth. `/provider/:provider/*` requires a valid short-lived token issued by the bot.

### Bot (`apps/bot`)

The bot runs as a long-lived Node.js process and is not suited for serverless. Deploy it to a persistent host:

1. Set the start command to `bun run start` (runs `dist/index.mjs`).
2. Add all variables from `apps/bot/.env.example`, including `PROXY_BASE_URL` pointing at the deployed proxy.
3. Set `SLACK_SOCKET_MODE=true`, Socket Mode keeps Slack's connection open without requiring a public HTTP endpoint for the bot itself.

**Database:**

Both apps must share the same `DATABASE_URL`. The bot writes short-lived proxy tokens; the proxy validates them. [Neon](https://neon.tech) works well for this, free tier is sufficient and the connection string supports SSL by default.

### Deploying the Sandbox Template

The E2B sandbox template must be built and registered before the bot can create sandboxes:

```bash
bun run build:sandbox
```

The template name comes from `config.template` in `apps/bot/src/config.ts`. After building, the template ID is pinned, update `config.template` if you create a new version.
