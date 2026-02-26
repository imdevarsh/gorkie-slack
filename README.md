# Gorkie (Slack AI Assistant)

Gorkie is a Slack AI assistant built with Bun, TypeScript, Vercel AI SDK, Slack Bolt, and E2B sandboxes.

## Architecture Overview

- `server/index.ts`: process bootstrap, telemetry init, Slack app start, sandbox janitor start.
- `server/slack/**`: Slack ingress, event filtering, conversation history retrieval.
- `server/lib/ai/**`: model providers, prompts, tool orchestration, streaming task UI updates.
- `server/lib/sandbox/**`: E2B sandbox lifecycle, RPC bridge to Pi agent, attachment sync, file upload handling.
- `server/db/**`: Drizzle schema + query helpers for sandbox session persistence.
- `server/types/**`: canonical shared type contracts.

## Request Flow (Text Diagram)

1. Slack event arrives in `message` handler.
2. Handler validates subtype/user/allowlist and builds message context.
3. Request is queued per-thread (`ctxId`) to keep thread processing serialized.
4. Conversation context is fetched and normalized for AI input.
5. Orchestrator agent runs tools (`reply`, `react`, `sandbox`, etc.).
6. Tool task state is streamed back to Slack thread as progress updates.
7. Final tool output is posted to Slack.

## Sandbox Flow (Text Diagram)

1. `sandbox` tool receives task.
2. `resolveSession` resumes an existing thread sandbox or creates a new one.
3. Attachments are synced into sandbox workdir.
4. Pi RPC client prompts the sandbox agent.
5. Runtime events map to task UI updates (`tool_execution_start/end`, retries).
6. `showFile` events trigger Slack upload workflow.
7. On completion or failure: client disconnects and sandbox is explicitly paused.

## How To Trace A Request

1. Start at `server/slack/events/message-create/index.ts` (`execute`).
2. Follow `generateResponse` in `server/slack/events/message-create/utils/respond.ts`.
3. Inspect tool wiring in `server/lib/ai/agents/orchestrator.ts`.
4. For sandbox tasks, continue into `server/lib/ai/tools/chat/sandbox-runner.ts`.
5. For lifecycle state, inspect `server/lib/sandbox/session.ts` and `server/lib/sandbox/events.ts`.

## Required Environment Variables

Validated in `server/env.ts`:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN` (required only when `SLACK_SOCKET_MODE=true`)
- `SLACK_SOCKET_MODE` (default: `false`)
- `PORT` (default: `3000`)
- `AUTO_ADD_CHANNEL` (optional)
- `OPT_IN_CHANNEL` (optional)
- `REDIS_URL`
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `HACKCLUB_API_KEY`
- `LOG_DIRECTORY` (default: `logs`)
- `LOG_LEVEL` (default: `info`)
- `EXA_API_KEY`
- `E2B_API_KEY`

Runtime-optional telemetry vars (read directly by Langfuse/OpenTelemetry libs):

- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_BASEURL`

## Development

```bash
bun install
bun run dev
bun run typecheck
bun run check
```

## E2B Template Notes

- Runtime uses E2B only.
- Template default: `gorkie-sandbox:latest`.
- Missing template is auto-built on demand.

## License

MIT
