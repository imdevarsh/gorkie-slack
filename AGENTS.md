# AGENTS.md

Guidelines for AI agents working in the Gorkie Slack bot codebase.

## Project Overview

Gorkie is a Slack AI assistant built with Bun, TypeScript, Vercel AI SDK, and Slack Bolt SDK.
It responds to mentions, DMs, and thread replies with AI-generated responses.

## Build and Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Development server (watch mode)
bun run start        # Production server
bun run format       # Format code
bun run lint         # Lint (check only)
bun run lint:fix     # Lint and auto-fix
bun run check        # Check formatting and linting
bun run fix          # Fix all issues
```

There are no tests in this project currently.

## Project Structure

```
server/
  index.ts              # Entry point, OpenTelemetry setup
  env.ts                # Environment validation with @t3-oss/env-core
  config.ts             # Application constants
  lib/
    ai/
      prompts/          # System prompts for the AI
      tools/            # AI tool definitions (reply, react, search, etc.)
      providers.ts      # AI model provider configuration
    allowed-users.ts    # User permission caching
    kv.ts               # Redis client and rate limiting
    logger.ts           # Pino logger configuration
  slack/
    app.ts              # Slack app initialization
    conversations.ts    # Message history fetching
    events/             # Slack event handlers
  types/                # TypeScript type definitions
  utils/                # Utility functions
```

## Code Style Guidelines

### Formatting (Biome)

- 2 spaces for indentation (not tabs)
- Single quotes for strings
- Always include semicolons

### TypeScript

- Strict mode enabled with `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`
- Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`)
- Path alias: `~/` references files from `server/` directory

### Imports

```typescript
// External packages first, then internal modules
import { tool } from 'ai';
import { z } from 'zod/v4';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';  // Use import type
```

Unused imports are errors (Biome rule).

### Naming Conventions

- Files: `kebab-case` (`get-user-info.ts`)
- Variables/functions: `camelCase` (`getUserInfo`)
- Types/interfaces: `PascalCase` (`SlackMessageContext`)
- Prefer named exports; exception: `logger` uses default export

### Type Definitions

Cast Slack event properties when accessing dynamic fields:

```typescript
const channelId = (ctx.event as { channel?: string }).channel;
const userId = (ctx.event as { user?: string }).user;
```

### Error Handling

Log errors with structured data, return structured error objects:

```typescript
logger.error({ error, channel: channelId }, 'Failed to send message');
return {
  success: false,
  error: error instanceof Error ? error.message : String(error),
};
```

### AI Tools Pattern

Tools needing context use a factory pattern:

```typescript
export const toolName = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Tool description',
    inputSchema: z.object({ /* ... */ }),
    execute: async (params) => {
      return { success: true, data: /* ... */ };
    },
  });
```

Stateless tools are simple exports:

```typescript
export const searchWeb = tool({
  description: 'Search the web',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => { /* ... */ },
});
```

### Environment Variables

- Define all env vars in `server/env.ts` using @t3-oss/env-core with Zod
- Access via `env.VARIABLE_NAME` (not `process.env`)

### Logging

Use the pino-based logger from `~/lib/logger` with structured context:

```typescript
logger.info({ channel, type }, 'Sent message');
logger.error({ error, userId }, 'Failed to fetch user');
```

Log levels: `debug`, `info`, `warn`, `error`

### Async Patterns

- Use `async/await` consistently
- Use `Promise.all` for parallel operations
- Use `void` prefix for fire-and-forget promises: `void main().catch(...)`

### Slack API Patterns

- Always check for undefined when accessing Slack event properties
- Use `WebClient` from the context for API calls
- Handle rate limiting via Redis in `lib/kv.ts`

## Key Dependencies

- `ai`: Vercel AI SDK for model interactions
- `@slack/bolt`: Slack app framework
- `zod`: Schema validation (v4 for some tools: `zod/v4`)
- `pino`: Logging
- `bun`: Runtime (use `RedisClient` from bun for Redis)
