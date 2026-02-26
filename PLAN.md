# Chat SDK Migration Plan

Date: 2026-02-25
Status: In Progress

## Objective
Replace Slack Bolt runtime/event handling with Vercel Chat SDK (`chat`) as the only production runtime path, while keeping current AI tool behavior and opt-in safety controls.

## Implementation Phases

1. Runtime cutover
- Add `server/chat/bot.ts` to create and own `Chat`.
- Use `createSlackAdapter` and Redis/memory state adapters.
- Register `onNewMention` and `onSubscribedMessage` handlers.
- Expose Slack webhook through `bot.webhooks.slack(request)`.

2. Boot and lifecycle
- Replace Bolt startup in `server/index.ts` with Bun HTTP server.
- Initialize and shutdown Chat SDK cleanly.
- Keep OpenTelemetry startup/shutdown and process-level error logging.

3. Context contract migration
- Add `server/types/chat-runtime.ts` with Chat SDK-oriented runtime context.
- Remove `SlackMessageContext` use from orchestrator, tools, prompts, and sandbox modules.
- Keep a normalized `event` shape for compatibility in existing tool internals.

4. Handler behavior parity
- Preserve mention-triggered entry and thread continuation behavior.
- Preserve opt-in channel gate denial message behavior.
- Preserve `shouldUse` filtering and bot/self-message suppression.

5. History/stream/status adaptation
- Build message context from `thread.messages` / adapter fetch APIs.
- Replace direct Slack `chat.startStream/appendStream/stopStream` calls with Chat SDK posting behavior.
- Map assistant status updates to Slack adapter methods.

6. Permissions cache migration
- Remove Bolt `App` dependency in `allowed-users`.
- Add standalone cache bootstrap + periodic refresh using Slack Web API client.

7. Cleanup
- Remove legacy Bolt runtime files from production path.
- Delete deprecated event handlers and types.
- Keep only Chat SDK runtime integration.

8. Validation
- Run `bun run typecheck` and `bun run check`.
- Verify logs include channel/thread/message/user identifiers.

## Completion Criteria
- `server/index.ts` no longer imports or starts Slack Bolt.
- `server/slack/app.ts` and `server/slack/events/*` removed.
- Runtime handlers process mention + subscribed thread messages via Chat SDK.
- Orchestrator/tools compile and execute with Chat runtime context.
