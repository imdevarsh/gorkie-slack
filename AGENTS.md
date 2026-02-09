# Gorkie Slack

A helpful AI Slack Bot built with AI SDK.

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
import { z } from 'zod';
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

### Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

#### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

#### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

#### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

#### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

#### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

#### Security

- Validate and sanitize user input
- Don't use `eval()` or assign directly to `document.cookie`
- All bot responses must be SFW - this is enforced at multiple levels

#### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)

### Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

### When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **Documentation** - Add comments for complex logic, but prefer self-documenting code

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.

## Key Dependencies

- `ai`: Vercel AI SDK for model interactions
- `@slack/bolt`: Slack app framework
- `zod`: Schema validation
- `pino`: Logging
- `bun`: Runtime (use `RedisClient` from bun for Redis)
