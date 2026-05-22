# Sandbox Proxy

`apps/server` owns the sandbox proxy. `apps/bot` writes short-lived proxy tokens directly to PostgreSQL and passes those tokens into the E2B sandbox as `GORKIE_SESSION_TOKEN`.

## Shape

- `GET /health` returns configured proxy providers.
- `ALL /:provider/*` forwards authenticated sandbox traffic to a configured upstream provider.

## Nitro Conventions

- Routes live under `apps/server/src/routes`.
- Middleware lives under `apps/server/src/middleware`.
- `nitro build` owns the Vercel output and bundles workspace packages.
- Use Web `Request`/`Response` APIs in route handlers where possible.

References:

- https://nitro.build/docs/routing
- https://nitro.build/deploy/providers/vercel

## Security Model

The proxy token proves that traffic came from a Gorkie-managed sandbox session. Provider API keys never leave the proxy process. A valid token can only reach providers listed in `apps/server/src/proxy/providers.ts`.

Tokens are stored in PostgreSQL in `proxy_tokens` with an expiry timestamp. The bot issues and revokes them through `@repo/db/queries`, so there is no internal proxy admin API key to leak. The table name is explicit because this is security-sensitive persistence; the source module is named `proxy` because tokens are an implementation detail of the proxy domain.

When the bot can resolve the sandbox outbound IP, it stores that IP on the token as `allowed_ip`. The proxy then accepts the token only when the incoming request IP matches `allowed_ip`, using `cf-connecting-ip`, `x-real-ip`, or the first `x-forwarded-for` value. This is defense-in-depth for token exfiltration: a leaked token is still short-lived and revoked on session cleanup, and an IP-bound token cannot be replayed from a different network.

## Local Test Path

1. Start PostgreSQL and Redis locally if they are not already running.
2. Copy `apps/server/.env.example` to `apps/server/.env` and fill `DATABASE_URL` and at least one provider key.
3. Run `bun run db:push`.
4. Validate with a temporary local script or direct HTTP requests against `nitro dev` based on the original `gorkie-slack/server/scripts/proxy-test.ts`.

Do not keep proxy tests checked in yet. The current migration target is to prove the sandbox proxy works locally, then delete any temporary validation script.

## Production Topology

Deploy `apps/server` to Vercel as the public Nitro proxy. Set the Vercel project root to `apps/server` and let Vercel run `bun run build`.

Nitro is intentional for this monorepo. Vercel's direct Hono source execution can emit unbundled ESM and then resolve workspace package exports such as `@repo/db/keys` to `.ts` source files. Nitro produces Vercel-compatible output and bundles the workspace code.

Run the bot separately on the Bun host that owns Slack connectivity. Set `apps/bot` `PROXY_BASE_URL` to the deployed Vercel proxy URL, not `localhost`, because E2B sandboxes must be able to reach it publicly.
