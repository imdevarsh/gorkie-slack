# Gorkie v2 TODO

Working notes for the rewrite. `REWRITE_PLAN.md` is the architectural plan; this file tracks concrete remaining work, refactors, verification, and upstream bets. Keep this priority-sorted and update checkboxes as work lands.

## P0 - Cleanup Before Slack History

- [ ] Decide whether `apps/bot/src/lib/ai/stream/index.ts` should keep its three stream-state collections or move to a small state object. Do not refactor unless it clearly reduces clutter.
- [ ] Verify the active-turn stop button still works after the agent folder split. Current placement stays separate from task rows because Chat SDK `StreamingPlan.endWith` appends controls after streaming completes and does not replace an active-stream control.
- [ ] Live verify long Slack responses split into follow-up messages without `msg_too_long`.
- [ ] Investigate why E2B template-installed skills are not visible to Pi. Check where `npx skills add` writes files, what `$HOME` is during build and runtime, and which `.agents/skills` roots the Pi adapter actually exposes through its resource loader.

## P1 - Bounded Slack Context And History

- [ ] Add a bounded Slack context prelude before each Pi prompt so Gorkie starts with the local Slack situation instead of needing to discover basic context from inside the sandbox.
- [ ] Thread mention behavior: when mentioned in a Slack thread, fetch the latest thread messages before prompting Pi. Target the Claude-like practical bound of the last 50 thread messages, sorted chronologically.
- [ ] Channel mention behavior: when mentioned in a channel root message, fetch recent top-level channel messages before prompting Pi. Target the Claude-like practical bound of the last 20 channel messages, sorted chronologically, excluding irrelevant bot/self noise.
- [ ] Use Chat SDK APIs first: `thread.adapter.fetchMessages(thread.id, { limit })` for thread context, `thread.channel.messages` or adapter `fetchChannelMessages` for channel context, and `thread.messages` / `thread.allMessages` only when pagination behavior is explicitly desired.
- [ ] Convert fetched Slack messages with `toAiMessages` from `chat/ai` when feeding model-message shaped context is useful. Prefer `includeNames: true` for multi-user thread context so Pi can distinguish speakers.
- [ ] Keep `createChatTools` reader tools available (`fetchMessages`, `fetchChannelMessages`, `fetchThread`, `listThreads`, `getChannelInfo`, `getUser`) even after preloading context. The preload gives Pi the immediate scene; tools let Pi fetch more when the user asks about older or broader context.
- [ ] Add Slack reader-tool privacy gates before broad history work. Gorkie can read DMs it has token access to, which is useful for current DM conversations but dangerous if tools let one user fetch or search another user's private DM context. Scope DM reads to the current DM/thread, block or require explicit approval for cross-DM reads, and make the model-facing tool descriptions say private conversations are not general workspace memory.
- [ ] Do not store a parallel full Slack transcript as the brain. Pi/Harness history remains the durable conversation memory; Slack context preload is bounded retrieval for the current turn.
- [ ] Make prompt text explicit: tell Pi which context was preloaded, the bounds used, and that anything outside those bounds requires calling Slack/Chat tools rather than pretending it saw the whole workspace.
- [ ] Bound by message count first, then add a token/character budget if real Slack threads produce oversized prompts. Trim oldest messages first, preserving the triggering message and direct parent/root.
- [ ] Include attachments only through Chat SDK supported paths. `toAiMessages` can include images and text-like files when `fetchData()` exists; log skipped unsupported attachments without failing the turn.
- [ ] Respect permissions and private-channel access. If Slack history fetch fails, continue with a short context note saying history was unavailable and let Pi use tools if needed.
- [ ] Add tests or harnessed smoke coverage for: thread mention with 50-message cap, channel mention with 20-message cap, DM follow-up, failed history fetch, and attachment-skipping behavior.
- [ ] Live verify in Slack that Gorkie can answer a thread-context question without first calling `fetchMessages`, and can still call `fetchMessages` for older context.

## P1 - Tool UX

- [ ] Ensure every restored old-Gorkie tool has success and error task rendering.
- [ ] Finish renderers for Chat SDK internal tools: `sendDirectMessage`, `postMessage`, `postChannelMessage`, `fetchMessages`, `fetchChannelMessages`, `listThreads`, `getChannelInfo`, `getUser`, `addReaction`, `removeReaction`.
- [ ] Add renderers for Chat SDK tools not currently surfaced in the checklist if they remain enabled by the `messenger` preset.
- [ ] Verify Slack task overflow stays bounded with the visible task cap plus one overflow task.

## P2 - Old Gorkie Tool Parity

- [ ] Implement recurring scheduled task parity: `scheduleTask`, `listScheduledTasks`, `cancelScheduledTask`.
- [ ] Verify all old Gorkie skills/tools with one live or harnessed smoke path.

## P2 - Reliability Verification

- [ ] Verify sandbox deletion recovery: delete or destroy a stored sandbox, send a follow-up in the same Slack thread, confirm v2 creates a fresh sandbox, re-seeds the mirrored Pi session file, and preserves conversation memory.
- [ ] Verify attachment seeding after a fresh sandbox resume.
- [ ] Verify Slack App Home: open, edit instructions, load preset, save preset, clear instructions.
- [ ] Verify Slack root mention vs reply-only mention vs subscribed thread behavior.
- [ ] Verify Langfuse receives AI SDK spans using `@ai-sdk/otel` + `LangfuseSpanProcessor`. [it doesn't!!]

## P3 - Tool Scope Decisions

- [ ] Decide whether to keep Chat SDK tools in the `messenger` preset or restrict/approve write tools. `messenger` allows cross-thread/channel posts and DMs, which helps old-Gorkie parity but needs clear approval expectations.
- [ ] Improve scheduled reminders, to say here's your reminder for xyz you asked in this thread, xyz

## Upstream AI SDK / Harness Expectations

- [ ] Native MCP support and skill support.
- [ ] Native steering support exposing queued user messages / `submitUserMessage` cleanly.
- [ ] Refactored Pi provider selection that is not ENV-prefix and model-id-order dependent.
- [ ] `ai-retry` support at the Harness/Pi boundary so custom retry logic can be deleted.
- [ ] Native Langfuse / OTel support deep enough for Harness/Pi model/tool/session internals.
- [ ] Official AI SDK E2B provider support with the resume/session-file hooks Gorkie needs.

- [ ] Our old implementation had configured PI REtry, basically even if one time model was down it'd retry in pi 3-4 times. Add that
- [ ] Another thing