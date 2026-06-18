# Gorkie v2 TODO

Working notes for the rewrite. `REWRITE_PLAN.md` is the architectural plan; this file tracks concrete remaining work, refactors, verification, and upstream bets.

## Old Gorkie Tool Parity
- Add `getWeather`.
- Add `leaveChannel`.
- Scheduled recurring tasks are later: `scheduleTask`, `listScheduledTasks`, `cancelScheduledTask`.

## Tool UX
- Keep tool outputs as model-facing data, not UI strings.
- Render task rows through `apps/bot/src/lib/ai/stream/tasks/*`, keyed by `toolName`.
- Every restored tool needs success and error task rendering.
- Internal Chat SDK tools also need renderers: `sendDirectMessage`, `postMessage`, `postChannelMessage`, `fetchMessages`, `fetchChannelMessages`, `listThreads`, `getChannelInfo`, `getUser`, `addReaction`, `removeReaction`.
- Avoid using generic `summary` as the primary task-row contract.

## Verification
- Verify all old Gorkie skills/tools with one live or harnessed smoke path.
- Verify sandbox deletion recovery: delete or destroy a stored sandbox, send a follow-up in the same Slack thread, confirm v2 creates a fresh sandbox, re-seeds the mirrored Pi session file, and preserves conversation memory.
- Verify attachment seeding after a fresh sandbox resume.
- Verify Slack App Home: open, edit instructions, load preset, save preset, clear instructions.
- Verify Slack root mention vs reply-only mention vs subscribed thread behavior.
- Verify stop button placement/action.
- Verify Langfuse receives AI SDK spans using `@ai-sdk/otel` + `LangfuseSpanProcessor`.

## Refactors
- Keep `apps/bot/src/lib/chat.ts` as the adapter/runtime construction point.

## Upstream AI SDK / Harness Expectations
- Native MCP support and skill support.
- Native steering support exposing queued user messages / `submitUserMessage` cleanly.
- Native steering status: Pi supports it and Harness v1 exposes `HarnessV1PromptControl.submitUserMessage(text)`, which `@ai-sdk/harness-pi` maps to `piSession.steer(text)`. `HarnessAgent` currently keeps that prompt control internal, so Gorkie cannot call it through `agent.stream()` / `HarnessAgentSession` directly.
- Possible steering implementation: wrap `createPi(...)` with a small `HarnessV1` proxy that intercepts `doPromptTurn` / `doContinueTurn`, stores the returned prompt control by Slack thread/session id, and calls `control.submitUserMessage(text)` for mid-turn Slack messages. Fall back to abort/re-prompt when the control is unavailable or a harness lacks `submitUserMessage`.
- Native vision is deferred: Pi's underlying SDK supports image inputs, but the installed `@ai-sdk/harness-pi@1.0.0-beta.11` adapter still extracts text only and rejects non-text user-message parts. Keep Slack attachments as sandbox files for now; revisit when Harness/Pi passes image/file parts through without package patching.
- Refactored Pi provider selection that is not ENV-prefix and model-id-order dependent.
- `ai-retry` support at the Harness/Pi boundary so custom retry logic can be deleted.
- Native Langfuse / OTel support deep enough for Harness/Pi model/tool/session internals.
- Official AI SDK E2B provider support with the resume/session-file hooks Gorkie needs.
- Pi plugin support.

## Tool Scope Decisions
- Decide whether to use AI SDK Chat SDK tools as `messenger` or restrict them to read-only. `messenger` allows cross-thread/channel posts and DMs, which may be useful for old Gorkie parity but needs clear routing and approval expectations.
- Decide whether Slack conversation context should be injected into the turn prompt automatically or remain available only through explicit Chat SDK tools such as `fetchChannelMessages` / `fetchMessages`. Automatic context improves first-turn behavior in Gorkie DEV; tool-only context keeps prompts smaller and lets the model choose when history matters.
- By default inject previous user history which is not in pi
- Rewrite steering from scratch
- Change back to just messanger
