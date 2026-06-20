---
title: Open Work
description: Known gaps, planned features, and cleanup targets.
---

This page tracks work that is important but not part of the current stable architecture.

## Response Reliability

- Verify long Slack responses with code blocks, tables, lists, and paragraphs.
- Keep task rows bounded so tool-heavy turns do not hit Slack limits.
- Keep assistant text chunking reliable before making it smaller.
- Revisit stop-button placement only if Chat SDK exposes an active-stream control surface.

## Slack Context

Gorkie should start a turn with bounded local Slack context instead of making the model discover obvious nearby context from scratch.

Target behavior:

- thread mentions preload the latest 50 thread messages;
- channel mentions preload the latest 20 recent channel messages;
- preloaded context is clearly labeled with its bounds;
- anything outside those bounds requires a Slack read/search tool;
- private conversations stay scoped to the current private conversation unless explicit approval exists.

Slack context preload is per-turn retrieval. It is not a second durable memory system.

## Tool Coverage

- Every exposed tool should have a clear success and error task renderer.
- Recurring scheduled task parity still needs `scheduleTask`, `listScheduledTasks`, and `cancelScheduledTask`.
- Write tools need product-level approval rules before broader usage.
- Scheduled reminders should include enough source context to be useful later.

## Recovery

- Verify stale E2B sandbox replacement with session-file reseeding.
- Verify attachment seeding after sandbox replacement.
- Verify App Home customization flows.
- Verify root mention, thread mention, subscribed reply, and DM routing.
- Improve Langfuse/OpenTelemetry coverage for model, tool, and session internals.

## Upstream Watchlist

- Pi provider/model selection should become less environment-prefix dependent.
- Harness/Pi retry support could replace custom fallback logic.
- An official AI SDK E2B provider may eventually replace local provider glue.
- Native observability could reduce local tracing setup.
