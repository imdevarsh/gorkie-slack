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
