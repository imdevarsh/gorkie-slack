# Package Strategy

This repo uses packages for real shared ownership, not as a default extraction target.

## Current Boundaries

- `@repo/ai`: shared AI provider config, tool metadata, and prompts used by the bot.
- `@repo/db`: Drizzle schema, PostgreSQL client, and query modules shared by the bot and server.
- `@repo/kv`: Redis env and client factory, ready for features that need shared KV/cache access.
- `@repo/logging`: shared Pino logger factory and logging env keys.
- `@repo/utils`: framework-agnostic helpers.
- `@repo/validators`: shared Zod schemas.
- `tooling/*`: repo tooling config packages.

App-specific integrations stay inside the app. Examples: Exa, AgentMail, Slack, E2B sandbox orchestration, and Langfuse/OpenTelemetry AI tracing are bot-owned today.

## Compiled vs JIT

Turborepo supports both patterns:

- Just-in-Time packages export source files and rely on the consuming app's bundler/runtime to compile TypeScript.
- Compiled packages produce build output and declarations, which is safer when the package is a runtime library consumed by more than one app or by tooling that may not compile TypeScript for dependencies.

This repo currently uses both patterns:

- `@repo/db` is compiled with `tsc -b` because it is the shared persistence boundary for both apps and benefits from declaration output plus project-reference style validation.
- `@repo/ai`, `@repo/kv`, `@repo/logging`, `@repo/utils`, and `@repo/validators` are source-exported packages that typecheck with `tsc --noEmit`. They do not need emitted artifacts until another toolchain or publish boundary requires them.

Better-T-Stack commonly uses lightweight source-exported internal packages for app-owned code, and compiled output only where the package boundary needs emitted artifacts. Coolify Tweaks' Nitro API also uses `nitro prepare && tsc --noEmit --skipLibCheck` at the app layer rather than `composite` app builds. That supports the current split: compile the DB package, keep the Nitro app and simple packages no-emit.

References:

- https://turborepo.dev/docs/core-concepts/internal-packages
- https://turborepo.dev/docs/crafting-your-repository/creating-an-internal-package
- https://turborepo.dev/docs/crafting-your-repository/running-tasks
- https://better-t-stack.dev/docs/project-structure

## Env Ownership

Use app-local env for variables consumed by exactly one app. Use package env only when the package needs to validate its own reusable service.

- Database env belongs to `@repo/db` because both bot and proxy use it.
- Logging env belongs to `@repo/logging` because both apps create loggers.
- AI provider env belongs to `@repo/ai` because the AI package owns provider construction.
- Langfuse/OpenTelemetry env stays in `apps/bot` because current telemetry is for AI SDK traces, not generic service telemetry.
- Proxy env stays split: bot needs `PROXY_BASE_URL`; server needs CORS and provider keys. Proxy tokens are issued through the shared database package, so there is no internal proxy admin key.
