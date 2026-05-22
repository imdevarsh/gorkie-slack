# Development

Gorkie runs as two local apps:

- `apps/bot` is the Slack bot.
- `apps/server` is the Nitro proxy that holds provider API keys.

The bot does not start or import the proxy server. For sandbox work, E2B must be able to reach `apps/server` through a public URL.

## Prerequisites

- Bun
- PostgreSQL
- A Slack app created from `apps/bot/slack-manifest.json`
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

Put provider API keys such as `HACKCLUB_API_KEY`, `OPENROUTER_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY` in `apps/server/.env`.

## Local Proxy Tunnel

Start the proxy server on port `3001`:

```bash
bun run dev:server
```

In another terminal, expose that local server with untun:

```bash
npx untun@latest tunnel http://localhost:3001
```

Copy the printed `https://...trycloudflare.com` URL into `apps/bot/.env`:

```bash
PROXY_BASE_URL="https://your-untun-url.trycloudflare.com"
```

Restart the bot after changing `PROXY_BASE_URL`.

This URL must point at the server root. The sandbox config appends provider paths like `/provider/hackclub`, and the sandbox session code calls `/ip` to resolve the sandbox outbound IP.

## Running Locally

Install dependencies and push the schema:

```bash
bun install
bun run db:push
```

Start both apps:

```bash
bun dev
```

For local Slack development, `SLACK_SOCKET_MODE=true` is the simplest setup because Slack does not need to reach your bot over HTTP. The proxy still needs a public tunnel because E2B sandboxes run outside your machine.

## Common Checks

```bash
bun run typecheck
bun check
bun run check:spelling
```
