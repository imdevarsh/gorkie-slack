# Agentic Run

## Goal

Port the Gorkie Slack bot into this Turborepo cleanly, with the bot runnable from `apps/bot`, the sandbox API-key proxy isolated in `apps/server`, shared packages only where reuse is real, and validation/docs that make future continuation safe after context loss.

## Active Scope

- Polish the Hono proxy using route modules, route chaining, Hono auth middleware, and exported `AppType`.
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
- Internal packages stay compiled when they are runtime libraries shared across apps. JIT exports are acceptable for app-local UI/config-style packages when the consuming toolchain can compile TypeScript directly.

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
- `bun run build` passes without the previous tsdown `noExternal` warning.
- `bun run check:spelling` passes.
- Direct `proxyApp.request()` smoke checks pass for `GET /health` and unauthenticated provider rejection.
- Local PostgreSQL and Redis should be started directly in the container for validation; no Docker Compose scripts are tracked.

## Notes For Continuation

- Do not move code into packages just because it can be moved. Package boundaries should reflect ownership and reuse.
- Prefer package-level scripts delegated by root `turbo run` scripts.
- Use object parameters for multi-argument APIs, especially sandbox boot/proxy helpers.
- Keep secrets out of command arguments and tracked files.
