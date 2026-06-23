---
title: TODO
description: Remaining reliability, context, tool, and upstream work.
---

This is the documentation view of the active cleanup list. `REWRITE_TODO.md` remains the detailed working tracker.

## P0 Cleanup Before Slack History

- [ ] Decide whether `apps/bot/src/lib/ai/stream/index.ts` should keep its three stream-state collections or move to a small state object.
- [ ] Live verify markdown-heavy long Slack responses split without `msg_too_long`, broken tables, broken code fences, stranded list items, or dangling intro lines.
- [ ] Fix Slack search expectations around Slack assistant search tokens and zero-result behavior.
- [ ] Bring assistant context like present channel in for Assistants Panel by slack [commit: `b3da0360c12bb8d1c28fd9849c18fbb747845698`].

## P1 Bounded Slack Context

- [ ] Add bounded Slack context before each Pi prompt.
- [ ] Thread mentions preload the latest 50 thread messages.
- [ ] Channel mentions preload the latest 20 recent channel messages.
- [ ] Use Chat SDK APIs first for thread and channel history.
- [ ] Use `toAiMessages` when model-message shaped context is useful.
- [ ] Keep the model-facing history surface small: `listThreads` and `readConversationHistory`.
- [ ] Tighten privacy gates for DMs, private channels, and cross-DM reads.
- [ ] Make prompt text explicit about what context was preloaded and what remains outside the bounds.
- [ ] Include attachments only through supported Chat SDK paths.
- [ ] Add smoke coverage for bounded context behavior.

## P2 Tool Parity

- [ ] Implement recurring scheduled task tools: `scheduleTask`, `listScheduledTasks`, `cancelScheduledTask`.
- [ ] Verify all old Gorkie tools with one live or harnessed smoke path.

## P2 Reliability Verification

- [ ] Verify stale or deleted sandbox recovery.
- [ ] Verify attachment seeding after fresh sandbox resume.
- [ ] Verify App Home customization flows.
- [ ] Verify root mention, reply-only mention, subscribed thread, and DM routing.
- [ ] Verify Langfuse receives useful Harness/Pi spans.
= [ ] Another problem is to properly detect errors in pi-agent, it doesn't detect properly
- [ ] Also, another problem the switching mdoel in sandbox doesnt wokr well [ i mean if sandbox alr has a model selected ]
## P3 Product Decisions

- [ ] Improve scheduled reminder copy with source context.

## Upstream Watchlist

- [ ] Native MCP and skill support.
- [ ] Cleaner Pi provider selection.
- [ ] Harness/Pi retry support.
- [ ] Native Langfuse/OpenTelemetry coverage deep enough for model/tool/session internals.
- [ ] Official AI SDK E2B provider support with resume/session-file hooks.
