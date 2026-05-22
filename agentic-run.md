# Agentic Run

## Goal

Port the Gorkie Slack bot into this Turborepo cleanly, with the bot runnable from `apps/bot`, the sandbox API-key proxy isolated in `apps/server`, shared packages only where reuse is real, and validation/docs that make future continuation safe after context loss.

## Active Scope

- Keep the proxy as a Nitro app with filesystem routes and standalone `.output` builds.
- Keep the Slack bot decoupled from the proxy server. The bot may configure sandboxes with `PROXY_BASE_URL`, but must not import or start the server.
- Move AI-specific Langfuse/OpenTelemetry startup out of the shared logging package.
- Keep env validation local to the app or package that owns the variable. Shared env packages should only exist for genuinely shared services such as database and logging.
- Evaluate Better-T-Stack/Turborepo package patterns before changing compiled/JIT package strategy.
- Validate the sandbox proxy based on the original `gorkie-slack` scripts without committing test artifacts.
- Run local PostgreSQL and Redis where available, push the Drizzle schema, and test the proxy.
- Rewrite README/env examples so setup is app-specific and not monorepo boilerplate.

## Current Decisions

- `apps/server` is the proxy app. The old in-bot proxy server and internal proxy admin API must stay removed.
- `apps/bot` issues and revokes sandbox proxy tokens directly through `@repo/db`; `PROXY_API_KEY` is intentionally gone.
- `apps/bot` owns AI telemetry startup because the telemetry is for AI SDK traces, not a generic app-wide concern.
- `@repo/logging` remains logging-only unless a second app needs shared non-AI observability primitives.
- `apps/server` uses Nitro because it bundles workspace packages into `.output` and avoids Vercel resolving raw `.ts` workspace exports at runtime.
- Keep `@repo/db` as a compiled/composite package for declaration output and query/schema graph checks. Keep simple source-export packages on `tsc --noEmit` unless they need emitted artifacts.

## Verification Checklist

- `bun run check`
- `bun run typecheck`
- `bun run build`
- `bun run check:spelling`
- `bun run db:push` when PostgreSQL is available
- Temporary sandbox proxy validation based on `/workspaces/gorkie-slack/server/scripts/proxy-test.ts`
- Manual proxy smoke tests against `apps/server`
- Redis smoke test when Redis is available locally

## Latest Evidence

- `bun run check` passes.
- `bun run typecheck` passes.
- `bun run build` passes with `apps/server` building through Nitro.
- `bun run check:spelling` passes.
- Nitro preview smoke checks pass for `GET /`, `GET /health`, `GET /ip`, CORS `OPTIONS`, unauthenticated proxy rejection, and DB-issued proxy-token forwarding.
- Local PostgreSQL and Redis should be started directly in the container for validation; no Docker Compose scripts are tracked.

## Notes For Continuation

- Do not move code into packages just because it can be moved. Package boundaries should reflect ownership and reuse.
- Prefer package-level scripts delegated by root `turbo run` scripts.
- Use object parameters for multi-argument APIs, especially sandbox boot/proxy helpers.
- Keep secrets out of command arguments and tracked files.
