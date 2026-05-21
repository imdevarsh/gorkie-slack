# Agentic Run

## Goal

Port the Gorkie Slack bot into this Turborepo cleanly, with the bot runnable from `apps/bot`, the sandbox API-key proxy isolated in `apps/server`, shared packages only where reuse is real, and validation/docs that make future continuation safe after context loss.

## Active Scope

- Polish the Hono proxy using route modules, route chaining, `zValidator`, and exported `AppType`.
- Keep the Slack bot decoupled from the proxy server. The bot may call the proxy over `PROXY_BASE_URL`, but must not import or start it.
- Move AI-specific Langfuse/OpenTelemetry startup out of the shared logging package.
- Keep env validation local to the app or package that owns the variable. Shared env packages should only exist for genuinely shared services such as database and logging.
- Evaluate Better-T-Stack/Turborepo package patterns before changing compiled/JIT package strategy.
- Add sandbox proxy tests based on the original `gorkie-slack` scripts.
- Run local PostgreSQL and Redis where available, push the Drizzle schema, and test the proxy.
- Rewrite README/env examples so setup is app-specific and not monorepo boilerplate.

## Current Decisions

- `apps/server` is the proxy app. The old in-bot proxy server must stay removed.
- `apps/bot` owns AI telemetry startup because the telemetry is for AI SDK traces, not a generic app-wide concern.
- `@repo/logging` remains logging-only unless a second app needs shared non-AI observability primitives.
- Internal packages stay compiled when they are runtime libraries shared across apps. JIT exports are acceptable for app-local UI/config-style packages when the consuming toolchain can compile TypeScript directly.

## Verification Checklist

- `bun run check`
- `bun run check-types`
- `bun run build`
- `bun run check:spelling`
- `bun run db:push`
- Temporary sandbox proxy validation based on `/workspaces/gorkie-slack/server/scripts/proxy-test.ts`
- Manual proxy smoke tests against `apps/server`
- Redis smoke test if Redis is available locally

## Notes For Continuation

- Do not move code into packages just because it can be moved. Package boundaries should reflect ownership and reuse.
- Prefer package-level scripts delegated by root `turbo run` scripts.
- Use object parameters for multi-argument APIs, especially sandbox boot/proxy helpers.
- Keep secrets out of command arguments and tracked files.
