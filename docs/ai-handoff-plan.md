# Gorkie Slack Task/Plan UI Handoff

## Reference repos used

### Primary repo (source of truth)
- Local path: `/workspaces/gorkie-slack`
- Project name: **Gorkie Slack**
- What it is: a Slack AI assistant bot built with Bun + TypeScript + Vercel AI SDK + Slack Bolt SDK.
- Behavior: responds to mentions, DMs, and thread replies using tool-driven agent logic.

### Secondary repo (API usage reference only)
- Repo: `https://github.com/slack-samples/bolt-js-assistant-template`
- Local clone path used during exploration: `/workspaces/gorkie-slack/bolt-js-assistant-template`
- Why it was used: reference for Slack Assistant streaming/task UX patterns, especially `client.chatStream(...).append(...).stop(...)` usage and `task_update` chunk behavior.
- Note: this is **not** the product source of truth; only a Slack SDK reference example.

## Repository context
Project: `gorkie-slack`
Runtime: Bun + TypeScript
Slack stack: Bolt + `@slack/web-api`
AI stack: Vercel AI SDK (`ToolLoopAgent`)

Relevant current message flow:
- `server/slack/events/message-create/index.ts`
- `server/slack/events/message-create/utils/respond.ts`
- `server/lib/ai/agents/orchestrator.ts`
- Tools under `server/lib/ai/tools/**`

## Goal
Implement Slack Assistant progress UI in **plan mode** so users see a single accordion-style plan with task cards, while preserving current final response behavior.

## Locked product decisions
1. Use `task_display_mode: 'plan'`.
2. Always emit initial task:
   - ID: `0-understand-task`
   - Title: `Understanding the task...`
   - Starts `in_progress`, then set to `complete`.
3. Task IDs are UUID
4. One tool = one task card lifecycle:
   - start (`in_progress`),
   - end (`complete` or `error`) on same ID.
5. Always emit terminal task at the end:
   - `n-final-response`.
6. Tool failure does **not** automatically mean overall run failure.
7. Terminal task status reflects response-generation outcome:
   - `complete` if response path succeeds,
   - `error` only if response generation/sending fails.
8. Stream error policy:
   - `startStream` failure: fail fast.
   - append/stop failure: log + ignore (best effort).
9. Bash tool updates:
   - only on start and finish,
   - no per-line streaming task updates,
   - keep truncation to limit overhead.

## Critical SDK requirement
Do not use raw internal calls like:
- `context.client.apiCall('chat.appendStream', ...)`

Use Slack SDK streamer API:
- `const streamer = client.chatStream({...})`
- `await streamer.append({...})`
- `await streamer.stop({...})`
