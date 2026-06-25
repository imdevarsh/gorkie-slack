# Gorkie TODO

Concrete remaining work for the current rewrite, plus open TODOs imported from
the v1 reference codebase. The active v2 tracker comes first. The rewrite plan
lives in `plans/rewrite.md`.

## Slack Context And History

### Summaries

- [ ] Revisit `summarizeThread` subagent design after there is an ephemeral
  Harness/Pi session path that does not create persistent sandbox rows.

### Context Prelude

- [ ] Add a bounded Slack context prelude before each Pi prompt so Gorkie starts
  with the local Slack situation instead of discovering basic context through
  tools.
- [ ] Thread mention preload: when mentioned in a Slack thread, fetch the latest
  thread messages before prompting Pi. Target the last 50 thread messages,
  sorted chronologically.
- [ ] Channel root mention preload: when mentioned in a channel root message,
  fetch recent top-level channel messages before prompting Pi. Target the last
  20 channel messages, sorted chronologically, excluding irrelevant bot/self
  noise.
- [ ] Make prompt text explicit about which context was preloaded, the bounds
  used, and that anything outside those bounds requires Slack/Chat tools.
- [ ] Bound by message count first, then add a token/character budget if real
  Slack threads produce oversized prompts. Trim oldest messages first while
  preserving the triggering message and direct parent/root.
- [ ] Include attachments only through Chat SDK supported paths. `toAiMessages`
  can include images and text-like files when `fetchData()` exists; log skipped
  unsupported attachments without failing the turn.

### Chat SDK Reads

- [ ] Use Chat SDK APIs first: adapter `fetchMessages` for thread replies and
  adapter `fetchChannelMessages` for channel context. Use Chat SDK state helpers
  only when pagination semantics are explicitly needed.
- [ ] Convert fetched Slack messages with `toAiMessages` from `chat/ai` when
  model-message shaped context is useful. Prefer `includeNames: true` for
  multi-user thread context so Pi can distinguish speakers.
- [ ] Keep the model-facing history surface small: `listThreads` for public
  channel thread discovery and `readConversationHistory` for public
  channel/thread reads. Add another reader only if a real workflow cannot be
  completed cleanly.
- [ ] Fix private-channel/thread access behavior. Gorkie should not let one user
  use bot/tool access as global private-channel memory.

### User-Scoped Search

- [ ] Add per-user Slack search using the Acting User's user token, not a shared
  bot/admin token, so Slack filters public channels, private channels, DMs,
  group DMs, users, and files to exactly what that user can access.
- [ ] Store Slack user-token authorization separately from bot credentials.
  Token lookup must be keyed by Acting User, and tool calls must fail closed
  when the requesting user has not authorized the needed user scopes.
- [ ] Add user-token search tools for Slack content, files, and users with
  explicit result provenance. Tool results should say they came from the Acting
  User's Slack-visible scope, not from global bot memory.
- [ ] Keep user-token search privacy scoped. Do not persist raw private-channel
  or DM search results into shared agent memory, global caches, or another
  user's thread context.
- [ ] Add shared-channel guardrails. If a user searches private DMs or private
  channels from a public or multi-user thread, require a private
  draft/confirmation step before posting sensitive results back to the shared
  thread.

## Slack Actions And UX

### Thread Behavior

- [ ] Verify Slack root mention, reply-only mention, and subscribed-thread
  behavior.
- [ ] Fix dev channel enforcement for the `#gorkie` channel.

### Posting And Drafting

- [ ] Support user-token DM actions only behind per-user authorization. Starting
  DMs/group DMs and sending messages on behalf of the Acting User must never
  silently fall back to a shared user token.
- [ ] Add DM draft lifecycle task renderers: drafting, awaiting approval,
  edited, sent, canceled, and failed. Do not dump private message bodies into
  logs or task summaries.
- [ ] Evaluate Slack carousel blocks for multi-item tool outputs, especially
  generated images and file lists. Decide whether carousel output should replace
  repeated file posts after task rendering is stable.
- [ ] Add assistant-sidebar context features, such as visible channel id/context
  metadata. Reference commit: `b3da0360c12bb8d1c28fd9849c18fbb747845698`.

## Streaming And Task Rendering

- [ ] Decide whether `apps/bot/src/lib/ai/stream/index.ts` should keep its three
  stream-state collections or move to a small state object. Refactor only if it
  clearly reduces clutter.
- [ ] Live verify markdown-heavy long Slack responses split into follow-up
  messages without `msg_too_long`, broken tables, broken code fences, stranded
  list items, or dangling intro lines.
- [ ] Verify task activity stays under Slack limits when reasoning blocks and
  tool rows are both present. Slack becomes unstable around large task counts.
- [ ] Refactor error message rendering so user-facing failures are lower-case,
  stage-aware, and do not confuse provider failures with Slack rendering bugs.

## Sandbox And Commands

### Sandbox Recovery

- [ ] Verify sandbox deletion recovery: delete or destroy a stored sandbox, send
  a follow-up in the same Slack thread, confirm v2 creates a fresh sandbox,
  re-seeds the mirrored Pi session file, and preserves conversation memory.

### Command Execution Hangs

- [ ] Add a prompt rule for background commands: redirect output and detach, for
  example `python -m http.server 8080 > /tmp/server.log 2>&1 &`.
- [ ] Investigate a host-owned bash override or sandbox `run` wrapper that
  starts commands in a process group and kills the group on abort/timeout. This
  is the real fix for orphaned background processes that keep stdout/stderr
  pipes open after the shell exits.

### Provider Timeout Evidence

- [ ] Handle retryable provider 524s cleanly. Observed failure:
  `qwen3.7-max` via `opencode-go` returned a Cloudflare 524
  `origin_response_timeout` from `dashscope-us.aliyuncs.com` with
  `retryable: true` and `retry_after: 120`.

## Models, BYOK, And Providers

### BYOK Implementation

- [ ] Add `BYOK_ENCRYPTION_KEY` to bot env validation and deployment docs.
  Require enough entropy for AES-256-GCM key derivation.
- [ ] Add a bot-owned versioned secret encryption helper.
- [ ] Add tests for the encryption helper: round-trip, tamper failure,
  wrong-key failure, malformed ciphertext, and no plaintext in thrown errors.
- [ ] Add `user_model_credentials` Drizzle schema and queries keyed by
  `(user_id, provider)`. Store encrypted key, base URL metadata, provider slug,
  selected model id, key preview, validation status, validation message,
  last-used timestamp, and audit timestamps.
- [ ] Keep raw BYOK secrets out of `packages/db` query logs and return types
  unless a bot-owned decrypting service explicitly asks for the encrypted
  payload.
- [ ] Define a single exported provider discriminant union and provider adapter
  map in `packages/ai` for Pi attempts: OpenRouter-compatible, opencode-go, and
  any direct provider added later.
- [ ] Replace static `chatAttempts` call sites with per-Acting-User attempt
  resolution: BYOK attempts first, service attempts only when no BYOK exists or
  explicit service fallback is enabled.
- [ ] Update turn execution, compaction, attempt selection, and attempt logging
  so provider/model selection is per turn and logs never include raw env or key
  material.
- [ ] Make `generateImage` policy explicit in code/UI: service image provider
  only unless an image-capable BYOK provider is configured.
- [ ] Add App Home Model Keys UI: add/rotate/delete credential, provider input,
  model id input, optional base URL, status display, and masked key preview
  only.
- [ ] Ensure Slack modal `private_metadata`, view state re-renders, prompt
  hints, Pi session files, E2B env, task renderers, and logs never contain raw
  API keys.
- [ ] Validate credentials on save or first use, store safe validation status,
  and surface invalid-key/auth/quota errors only to the Acting User where Slack
  allows.
- [ ] Decide service fallback UX: default off for BYOK failures, with explicit
  opt-in if users may spend the shared service key after their key fails.
- [ ] Add tests for provider-to-`customEnv` mapping, BYOK-first fallback order,
  service fallback disabled, invalid-key handling, App Home modal parsing, and
  ownership checks.
- [ ] Live smoke: save a key, run a Slack turn, run compaction, rotate the key,
  delete the key, trigger an invalid-key turn, and verify two users in one
  thread use separate credentials without leaking provider/key details.

### Provider Selection

- [ ] Investigate why Gorkie sometimes does not switch models properly.
- [ ] Verify Langfuse receives AI SDK spans using `@ai-sdk/otel` plus
  `LangfuseSpanProcessor`. Current note: it does not.

## Verification Matrix

- [ ] Add tests or harnessed smoke coverage for thread mention with 50-message
  cap, channel mention with 20-message cap, DM follow-up, failed history fetch,
  and attachment-skipping behavior.
- [ ] Live verify in Slack that Gorkie can answer a thread-context question from
  the preload and can still call `readConversationHistory` for older or broader
  context.

## Upstream AI SDK And Harness Bets

- [ ] Native MCP support and skill support.
- [ ] Native steering support exposing queued user messages or
  `submitUserMessage` cleanly.
- [ ] Refactored Pi provider selection that is not ENV-prefix and
  model-id-order dependent.
- [ ] `ai-retry` support at the Harness/Pi boundary so custom retry logic can be
  deleted.
- [ ] Native Langfuse/OTel support deep enough for Harness/Pi model, tool, and
  session internals.
- [ ] Official AI SDK E2B provider support with the resume/session-file hooks
  Gorkie needs.
- [ ] Pi-level retry parity with the old implementation so transient provider
  failures can retry inside Pi before Gorkie's outer attempt fallback runs.

## V1 Reference TODOs

Imported from `/workspaces/worktrees/gorkie-slack/reference/TODO.md`. These are
not automatically v2 requirements, but they capture bugs and product gaps found
in the old implementation.

### Provider And Model Reliability

- [ ] Add a configurable output cap for chat and sandbox model calls so provider
  fallback requests do not reserve unaffordable default output budgets. The v1
  trace showed HackClub returning Cloudflare 504 HTML, then OpenRouter rejecting
  fallback with a 402 because it reserved up to `65_536` output tokens.
- [ ] Add multi-provider retry for the Pi sandbox agent so coding-agent failures
  can fall back to alternative providers instead of ending the task.
- [ ] Evaluate whether the primary chat model should move from Gemini Flash to
  a smaller GPT-5 family model. Document cost, latency, context, and quality
  tradeoffs before changing defaults.
- [ ] Remove the local `ai-retry` patch when upstream supports AI SDK 7 without
  local declaration changes. Until then, keep AI SDK packages on the same v7
  canary line, keep `ai-retry` pinned, and smoke-test provider fallback after
  provider or AI SDK bumps.

### MCP And OAuth

- [ ] Show manually denied tools in the thinking/task panel after approval
  resume. Denied approvals need synthetic pre-tasks in the new response stream.
- [ ] Improve MCP tool task display. Show the normalized MCP tool name in the
  title, such as `Using Fathom: list_meetings`, plus concise clamped input and
  output previews.
- [ ] Lock down connection-defining MCP server fields after creation. URL,
  transport, and auth type should require deleting and re-adding the server.
- [ ] Add scheduled MCP OAuth token refresh before expiry and record refresh
  failures without breaking unrelated MCP servers.
- [ ] Add MCP tool discovery before full OAuth so users can preview available
  tools in the Slack setup flow.
- [ ] When setting an entire MCP tool group, apply the change to the whole group,
  not only the currently visible pagination page. Search results can stay scoped
  to the visible results.

### Slack Stream And Task UX

- [ ] If a terminal tool fires without visible reasoning, show the terminal task
  directly, such as `Replied`, `Skipping`, or `Left channel`, instead of a
  generic thinking task.
- [ ] Investigate intermittent missing thinking/reasoning in Slack task streams.
  Verify reasoning lifecycle events appear before tool calls and remain visible
  after terminal tasks.
- [ ] Prevent Slack task cards from overflowing block limits. Start a
  continuation task card when the current card approaches Slack limits.
- [ ] Make Slack search errors non-fatal so a search failure does not mark an
  otherwise successful task as failed.
- [ ] Fix pinned-item detection for Slack search results. Confirm whether
  user-specific pinning requires `pins.list`, `conversations.info`, or another
  Slack API path.
- [ ] After sandbox upload tools run, inject the uploaded file list into the
  model-visible response context so the agent knows what was uploaded.

### Sandbox And Browser Tooling

- [ ] Investigate why `agent-browser --snapshot /path/to/file.png` does not save
  files where the sandbox agent expects them. Determine whether it writes
  relative to the command CWD, daemon CWD, or a temp directory.
- [ ] Add `agentmail` to the E2B sandbox template or document it as a first-run
  install for the `agent-browser` skill.

### Cleanup And Package Shape

- [ ] Clean up message pipeline utilities from the old Slack stack:
  `message-context.ts`, `triggers.ts`, `conversations.ts`, and `context.ts`.
  Remove duplicated `users.info` patterns and tighten stale types if any of
  that code is reintroduced.
- [ ] Continue reducing schema and type clutter. Move reusable types into clear
  type owners, keep Slack actions/views feature-owned, and avoid one-shot
  helpers.
- [ ] Consider whether more package extraction is worth it, especially
  observability and sandbox logic, if those areas become shared by bot and
  server code.
- [ ] Build out `packages/kv` before any feature uses it. Add typed key builders
  and query helpers, and decide whether serverless paths need Upstash instead
  of a persistent Redis connection.

### Workflow

- [ ] Add an opt-in checkpoint flow for larger agent tasks. Commits must stay
  scoped to the current task and avoid unrelated dirty worktree changes.
- [ ] If a planning thread exceeds roughly 50 messages, start a new planning
  block to avoid context degradation.
