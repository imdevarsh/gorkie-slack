# Sandbox Proxy

`apps/server` owns the sandbox proxy. `apps/bot` only asks the server for short-lived proxy tokens and passes those tokens into the E2B sandbox as `GORKIE_SESSION_TOKEN`.

## Shape

- `GET /health` returns configured proxy providers.
- `POST /internal/tokens` issues a short-lived token for a sandbox. It is protected by `PROXY_API_KEY`.
- `DELETE /internal/tokens/:sandboxId` revokes all proxy tokens for a sandbox. It is protected by `PROXY_API_KEY`.
- `ALL /:provider/*` forwards authenticated sandbox traffic to a configured upstream provider.

## Hono Conventions

- Route groups live in separate `Hono` instances and are mounted with `route()`.
- Request validation uses `@hono/zod-validator`.
- Bearer parsing uses Hono's `bearerAuth` middleware rather than hand-rolled header parsing.
- `AppType` is exported from the chained route value so Hono RPC can infer routes correctly if a typed client is added later.
- Tests should prefer `app.request()` or `Bun.serve({ fetch: proxyApp.fetch })` instead of booting a separate framework wrapper.

References:

- https://hono.dev/docs/api/routing
- https://hono.dev/docs/guides/best-practices
- https://hono.dev/docs/guides/validation
- https://hono.dev/docs/middleware/builtin/bearer-auth

## Security Model

The proxy token proves that traffic came from a Gorkie-managed sandbox session. Provider API keys never leave the proxy process. A valid token can only reach providers listed in `apps/server/src/proxy/providers.ts`.

Tokens are stored in PostgreSQL in `proxy_tokens` with an expiry timestamp. The table name is explicit because this is security-sensitive persistence; the source module is named `proxy` because tokens are an implementation detail of the proxy domain.

## Local Test Path

1. Start PostgreSQL and Redis locally if they are not already running.
2. Copy `apps/server/.env.example` to `apps/server/.env` and fill `DATABASE_URL`, `PROXY_API_KEY`, and at least one provider key.
3. Run `bun run db:push`.
4. Validate with a temporary local script or direct `proxyApp.request()` calls based on the original `gorkie-slack/server/scripts/proxy-test.ts`.

Do not keep proxy tests checked in yet. The current migration target is to prove the sandbox proxy works locally, then delete any temporary validation script.
