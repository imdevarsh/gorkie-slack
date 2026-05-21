# Gorkie Slack

A helpful AI Slack Bot built with AI SDK.

## Project Overview

Gorkie is a Slack AI assistant built with Bun, TypeScript, Vercel AI SDK, and Slack Bolt SDK.
It responds to mentions, DMs, and thread replies with AI-generated responses.

## Build and Development Commands

```bash
bun install          # Install dependencies
bun dev              # Start all apps in watch mode
bun build            # Build all apps and packages
bun typecheck        # Type-check the monorepo
bun check            # Lint + format check (Ultracite/Biome)
bun fix              # Auto-fix lint and formatting issues
bun run check:spelling  # Spell-check with cspell
bun run db:push      # Push schema changes to database
```

There is no committed test suite for the sandbox proxy yet. Use temporary local scripts or direct app requests for validation, then delete those artifacts.

## Project Structure

```
apps/
  bot/              # Slack bot (entry point: src/index.ts)
  server/           # Independent Hono server for proxy/API work
packages/
  ai/               # AI providers, model config, and system prompts
  db/               # Drizzle ORM schema, queries, Postgres client
  kv/               # Redis env and client factory
  logging/          # Pino logger factory
  utils/            # Shared framework-agnostic utility helpers
  validators/       # Shared Zod schemas
tooling/
  cspell/           # @repo/cspell-config — spell-check dictionaries
  github/           # Reusable GitHub Actions (setup action)
  typescript/       # @repo/tsconfig — shared TypeScript configs
```

The Slack bot must not start or import the proxy server. Proxy/runtime API work belongs in `apps/server`; `apps/bot` should only call it through configured URLs.

Hono routes should be written as route modules with chained route values where practical. Use Hono middleware such as `bearerAuth` for auth parsing, use schema validation when a route accepts structured input, and export the chained `AppType` when it could be used by a typed client.

## Coding Guidelines

### Inline over extract
Prefer inlining over creating utility functions. Only extract to a named function when the logic is called in **multiple places** or is genuinely complex. A helper called exactly once is worse than the code it replaced.

```ts
// bad — one-shot helper
function getFileExtension(mime: string) { return MAP[mime] ?? 'png'; }
const ext = getFileExtension(image.mediaType);

// good — just inline it
const ext = EXTENSION[image.mediaType] ?? 'png';
```

### Dict params
Functions with more than one parameter should take a single options object. Prefer this even for one-param functions when that parameter is logically a "config" rather than a plain value.

```ts
// bad
logReply(ctxId, author, result, reason);

// good
logReply({ ctxId, author, result, reason });
```

### No `as const` on type discriminants
When building objects that need a literal type for a discriminant field (e.g. `type: 'text'`), cast the whole expression to the SDK type instead of using `as const` on the property.

```ts
// bad
{ type: 'text' as const, text }

// good — use the SDK's UserContent type
[{ type: 'text', text }, ...images] as UserContent
```

### No comments explaining what code does
Only add a comment when the **why** is non-obvious — a hidden constraint, a workaround for a specific bug, or behaviour that would genuinely surprise a reader. Never describe what the code already says.

### No JSDoc / docstrings
No multi-line block comments on functions. Self-documenting names are enough.

### Config for tuneable values
Anything that could reasonably change per deployment (thresholds, message lists, locale) belongs in `apps/bot/src/config.ts`, not hardcoded at the call site.

### Feature-enclosed architecture
Slack features live under `apps/bot/src/slack/features/<name>/`. Each feature exports `{ actions, views, commands }` from its `index.ts` when applicable. Keep feature-specific UI/actions near the feature that owns them.

## Formatting and Linting (Ultracite)

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.
