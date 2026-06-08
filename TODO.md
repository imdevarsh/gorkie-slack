# TODO

Active task list for gorkie-turbo. Kept in sync as issues are found and resolved.

---

## Done

- [x] **tsdown `copy` fix** — replaced Linux-only `onSuccess` shell command with tsdown's built-in `copy: 'src/lib/sandbox/config'` config key. Copies `extensions/tools.ts` → `dist/extensions/tools.ts` (where `import.meta.url` resolves in the production bundle) and `index.ts` (harmless extra). Cross-platform, no shell required.
  - File: `apps/bot/tsdown.config.ts`

- [x] **Sandbox-before-reply ordering** — the outer orchestrator was calling `reply` and `sandbox` as parallel tool calls in the same step. Since `stopWhen: [successToolCall('reply')]` ends the loop after that step, the reply text was written before sandbox results were available ("I've spun up a sandbox for you. It's ready and waiting—what would you like to do with it?" sent before the actual task ran). Fixed by adding a rule to the `reply` tool: "Never call reply in the same step as sandbox or any other tool."
  - File: `packages/ai/src/prompts/chat/tools.ts`

---

## Open

### Bug: AI provider fallback ends on OpenRouter max_tokens credit failure
Production logs show HackClub and OpenRouter calls failing during fallback:
- HackClub sometimes returns a Cloudflare `504 Gateway time-out` HTML response.
- OpenRouter then rejects the fallback request with:
`Agent failed: 402 This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens...`

The request body in one trace has `max_tokens: undefined`, so OpenRouter appears to reserve the model's default max output budget (`65536`) rather than a value explicitly set by Gorkie. Add a configurable output cap for chat and sandbox model calls so fallback requests do not reserve unaffordable output budgets.
- Files: `packages/ai/src/providers.ts`, `apps/bot/src/config.ts`, `apps/bot/src/lib/sandbox/config/index.ts`
- Validation: confirm HackClub `504` responses retry to the next provider and OpenRouter/HackClub requests no longer reserve `65536` output tokens by default.

### Improve: Show denied tools in thinking panel
When a user clicks "Deny" on an approval card, the new response stream starts fresh with no record of the denial. Blocked tools (configure mode = deny) correctly show a "Denied Server: tool" task because they run inside the same stream. Manually denied tools can't update the old stream (already closed), so they need synthetic tasks at the start of the new stream.
- (a) Add `serverName`, `toolName`, `input` to `ApprovalOutcome` for denied items; populate in `approval.ts` from `batch.siblings`.
- (b) Add `preTasks?` to `runAgent`; emit them as complete tasks right after `initStream`.
- (c) In `resumeResponse`, build `preTasks` from denied approvals and pass to `runAgent`.
- Files: `approval-helpers.ts`, `approval.ts`, `respond.ts`, `resume.ts`

### Improve: MCP tool task display
MCP tool tasks should show the normalized MCP tool name in the title, plus concise input and output details. For example, use `Using Fathom: list_meetings` instead of only `Using Fathom MCP`, then include a clamped JSON input preview and a clamped text/JSON output preview.
- File: `apps/bot/src/lib/mcp/remote.ts`

### Improve: MCP server edit flow
Lock down connection-defining MCP server fields after creation. URL, transport, and auth type should require deleting and re-adding the server rather than editing an existing connected server in place.
- Files: `apps/bot/src/slack/features/customizations/mcp/views/save/index.ts`, `apps/bot/src/slack/features/customizations/mcp/actions/configure.ts`, `packages/db/src/queries/mcp/servers.ts`

### Improve: MCP OAuth token refresh
OAuth connections store `expiresAt`, but refresh is currently reactive at use time. Add a scheduled refresh path that renews tokens shortly before expiry and records refresh failures without breaking unrelated MCP servers.
- Files: `apps/server/src/tasks/`, `apps/server/nitro.config.ts`, `packages/db/src/queries/mcp/connections.ts`

### Improve: MCP tool discovery before full OAuth
Users cannot preview available tools until after OAuth completes. Add a server-side discovery endpoint that attempts `listTools()` with current credentials and returns an empty list on auth failure, then surface the result in the Slack setup flow.
- Files: `apps/server/src/routes/`, `apps/bot/src/slack/features/customizations/mcp/`

### Improve: Multi-provider retry for Pi sandbox agent
The Pi coding agent inside the sandbox uses a single provider/model. It should have a retry chain similar to the orchestrator (`createRetryable`) so it falls back to alternative providers on failure rather than erroring out.

### Improve: Orchestrator — show terminal tool as task when no reasoning was shown
Currently `prepareStep` always creates a "Thinking…" task, after terminal tool firing show just show "Replied" / "Skipping" / "Left channel" directly as the task title
- File: `apps/bot/src/lib/ai/agents/orchestrator.ts`

### Improve: Auto-commit at checkpoints
Add an explicit checkpoint flow for larger agent tasks so meaningful working states can be committed automatically when the user opts into that workflow.
- Keep commits scoped to the current task and avoid mixing unrelated dirty worktree changes.
- Consider where checkpoint metadata belongs before adding more one-off state fields.

### Bug: Task stream is intermittent — thinking sometimes missing
The "Thinking…" task created in `prepareStep` of `orchestratorAgent` and its reasoning text are sometimes not shown in Slack. Partially addressed in `292bfbb` by consuming AI SDK reasoning lifecycle events in `consumeOrchestratorStream`, buffering reasoning details, and preventing late flushes from moving a completed task back to `in_progress`.
- Files: `apps/bot/src/lib/ai/agents/orchestrator.ts`, `apps/bot/src/lib/ai/utils/stream.ts`
- Verify in live Slack: does `prepareStep` always fire before reasoning deltas, and do provider reasoning details remain visible after tool calls and terminal reply/skip/leave tasks?

### Investigate: Main chat model switch
Evaluate whether the primary chat model should move from the current Gemini Flash model to a smaller GPT-5 family model, and document the cost, latency, context, and quality tradeoffs before changing defaults.
- Files: `packages/ai/src/providers.ts`, `apps/bot/src/config.ts`

### Bug: Slack task cards overflow block limits
Long-running tool sessions can push the task item list past Slack's block limit and break the task card. When the current task card approaches the limit, start a continuation task card that preserves the active top-level task context, then append subsequent task items there.
- Files: `apps/bot/src/lib/ai/utils/task.ts`, `apps/bot/src/lib/ai/utils/stream.ts`

### Bug: `agent-browser` snapshot not saving files
When the sandbox agent uses `agent-browser` to capture screenshots, `--snapshot /path/to/file.png` does not appear to write files to disk (file not found after command). The daemon opens the page successfully but the output file is missing. Needs investigation into whether `agent-browser`'s snapshot command writes relative to CWD, the daemon's CWD, or a temp dir.
- Workaround: may need to use Playwright directly or pipe `agent-browser snapshot -i` to a custom save step.

### Improve: `agent-browser` skill — agentmail not in sandbox template
The `agent-browser` npm package is installed globally by the sandbox, but `agentmail` is not pre-installed in the E2B template. The sandbox agent has to install it on first use, adding latency and failure surface. Either:
- Add `agentmail` to the E2B sandbox template (rebuild with `bun run build:template`)
- Or note it as a first-run install in the skill documentation

### Refactor: Clean up message pipeline utilities
`message-context.ts`, `triggers.ts`, `conversations.ts`, and `context.ts` accumulated dead code and duplicate patterns from the `users.info` caching work. Worth a pass to:
- Remove any remaining inline `users.info` calls (should all go through `getSlackUserName`)
- Simplify `buildUserCache` in `conversations.ts` — now just a thin wrapper
- Audit `triggers.ts` for any leftover priming logic
- Tighten types in `message-context.ts` now that `getAuthorName` no longer takes `ctxId`
- Files: `apps/bot/src/slack/conversations.ts`, `apps/bot/src/slack/events/message-create/utils/message-context.ts`, `apps/bot/src/utils/triggers.ts`, `apps/bot/src/utils/context.ts`

### Refactor: Reduce schema and type clutter
The codebase is accumulating inline schemas, duplicated DTO shapes, and large files that mix Slack UI, persistence, and orchestration concerns. Do a cleanup pass guided by `AGENTS.md`:
- Move reusable types into `apps/bot/src/types/` or package-level type files.
- Keep feature-owned Slack actions/views inside their feature folders.
- Split genuinely shared logic into small feature utilities, but avoid one-shot helpers.
- Prefer dict params for functions with multiple inputs.

### Bug: Slack search errors mark entire task as failed + pinned items shown incorrectly
When the bot performs a Slack search (e.g. searching for pinned messages or user-pinned items), errors from the search API bubble up and mark the whole task as a failure in the task list. The user sees the entire task as red/failed even if the core work succeeded. Additionally, pinned item detection doesn't correctly identify items the user has pinned — it may be checking the wrong field or returning all pins regardless of who pinned them.
- Investigate: does the search error get caught and surfaced as a task failure? Wrap search calls so errors are non-fatal.
- Investigate: pinned item filter logic — check whether `conversations.info` pin fields vs. `pins.list` API is being used, and whether user-specific pinning is filterable.
- Files: `apps/bot/src/lib/ai/` (search tool), wherever pinned item logic lives

### Refactor: Split monorepo packages further
Consider extracting:
- **`@repo/observability`** — telemetry/Langfuse setup currently lives in `apps/bot/src/lib/ai/telemetry.ts`, could be a shared package if `apps/server` ever needs it
- **`@repo/sandbox`** — sandbox session management, RPC boot, event subscription, config, attachments currently all live in `apps/bot/src/lib/sandbox/`. If sandbox logic is ever reused (e.g. scheduled tasks calling the sandbox), extracting a package reduces coupling.
- Evaluate whether the split is worth the overhead given current team size.

### Improve: `packages/kv` — wire up keys and queries
`packages/kv` is a stub (`createRedisClient` factory, nothing else). Redis is not imported anywhere in the apps yet. Needs to be built out properly before any feature uses it.

Pattern to follow: mirror `packages/db/src/queries/` — export typed helper functions, not raw clients.

What to add:
1. **`src/keys.ts`** — typed key builders (namespaced strings, no magic literals scattered around):
   ```ts
   export const keys = {
     rateLimit: (userId: string) => `rate_limit:${userId}`,
     imageGen: (userId: string) => `image_gen:${userId}`,
     // ...
   };
   ```
2. **`src/queries/`** — typed query helpers wrapping the client:
   - `rateLimit(userId, opts)` — sliding window or token bucket, returns `{ allowed, remaining, reset }`
   - `getCache(key)` / `setCache(key, value, ttlMs)` — simple get/set with TTL
3. **Client lifetime**: the current factory throws if `REDIS_URL` is unset — that's fine, but callers should only import from `@repo/kv` in code paths gated by a `REDIS_URL` check. Document this.
4. **Consider Upstash**: gorkie-slack uses `bun`'s built-in `RedisClient`. For `apps/server` (Vercel serverless), a persistent TCP connection isn't viable — Upstash's HTTP client (`@upstash/redis`) is a better fit. Evaluate whether bot and server need the same client or different ones.

- Files: `packages/kv/src/`

---

## Notes

- Proxy timeout is `AbortSignal.timeout(240_000)` (4 min) — safely under Vercel's 300s `maxDuration`.
- `tools.ts` is uploaded as raw TypeScript source to E2B via `configureAgent`; it must NOT be compiled or it breaks the PI agent's dynamic extension loading.
- If a plan block (conversation thread used for planning/tasking) exceeds 50 messages, start a new plan block to avoid context degradation.

Also, when the sandbox resolved, every uploadFile that has been called shld be included in response injected bcs ai needs to know what was uploaded
Also, for groups like read-only, etc... Set All thing it shld do whole read only goup not olny ones shown in pagination? but in search yea only for search results... [configure modal]