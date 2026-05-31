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

- [x] **Multi-provider retry for Pi sandbox agent** — `configureAgent` now writes all three providers (`hackclub`, `openrouter`, `gemini`) to `models.json` and `auth.json`, each routed through the bot's proxy with `GORKIE_SESSION_TOKEN`. Added `maxDelayMs: 60000` to retry config. Fallback provider list lives in `sandbox.fallbackProviders` in `apps/bot/src/config.ts`.
  - Files: `apps/bot/src/config.ts`, `apps/bot/src/lib/sandbox/config/index.ts`

### Improve: Orchestrator — show terminal tool as task when no reasoning was shown
Currently `prepareStep` always creates a "Thinking…" task, after terminal tool firing show just show "Replied" / "Skipping" / "Left channel" directly as the task title
- File: `apps/bot/src/lib/ai/agents/orchestrator.ts`

### Bug: Task stream is intermittent — thinking sometimes missing
The "Thinking…" task created in `prepareStep` of `orchestratorAgent` and its reasoning text (`consumeOrchestratorReasoningStream`) are sometimes not shown in Slack. Possibly a race condition in task creation vs. stream consumption, or the reasoning stream arriving after the step task is already resolved.
- Files: `apps/bot/src/lib/ai/agents/orchestrator.ts`, `apps/bot/src/lib/ai/utils/stream.ts`
- Investigate: does `prepareStep` always fire before the reasoning stream starts? Check if the taskMap entry is set before `consumeOrchestratorReasoningStream` is called.

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
