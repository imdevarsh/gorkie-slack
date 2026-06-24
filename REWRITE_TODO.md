# Gorkie v2 TODO

Working notes for the rewrite. `REWRITE_PLAN.md` is the architectural plan; this file tracks concrete remaining work, refactors, verification, and upstream bets. Keep this priority-sorted and update checkboxes as work lands.

## P0 - Cleanup Before Slack History

- [ ] Decide whether `apps/bot/src/lib/ai/stream/index.ts` should keep its three stream-state collections or move to a small state object. Do not refactor unless it clearly reduces clutter.
- [ ] Live verify markdown-heavy long Slack responses split into follow-up messages without `msg_too_long`, broken tables, broken code fences, stranded list items, or dangling intro lines.
- [ ] Add-assistant sidebar features, like context on the assistant sidebar for channel id, etc. `b3da0360c12bb8d1c28fd9849c18fbb747845698`. 

## P1 - Bounded Slack Context And History

- [ ] Add a bounded Slack context prelude before each Pi prompt so Gorkie starts with the local Slack situation instead of needing to discover basic context from inside the sandbox.
- [ ] Add per-user Slack search using the Acting User's user token, not a shared bot/admin token, so Slack filters public channels, private channels, DMs, group DMs, users, and files to exactly what that user can access.
- [ ] Store Slack user-token authorization separately from bot credentials. Token lookup must be keyed by Acting User, and tool calls must fail closed if the requesting user has not authorized the needed user scopes.
- [ ] Add user-token search tools for Slack content/files/users with explicit result provenance: every prompt/tool result should say the results came from the Acting User's Slack-visible scope, not from global bot memory.
- [ ] Keep user-token search privacy scoped. Do not persist raw private-channel/DM search results into shared agent memory, global caches, or another user's thread context; only summarize into the current turn when the Slack surface is safe for the participants.
- [ ] Add guardrails for shared-channel use: if a user searches their private DMs/private channels from a public or multi-user thread, require a private draft/confirmation step before posting any sensitive result back into the shared thread.
- [ ] Thread mention behavior: when mentioned in a Slack thread, fetch the latest thread messages before prompting Pi. Target the Claude-like practical bound of the last 50 thread messages, sorted chronologically.
- [ ] Channel mention behavior: when mentioned in a channel root message, fetch recent top-level channel messages before prompting Pi. Target the Claude-like practical bound of the last 20 channel messages, sorted chronologically, excluding irrelevant bot/self noise.
- [ ] Use Chat SDK APIs first: adapter `fetchMessages` for thread replies and adapter `fetchChannelMessages` for channel context. Use Chat SDK state helpers only when pagination semantics are explicitly desired.
- [ ] Convert fetched Slack messages with `toAiMessages` from `chat/ai` when feeding model-message shaped context is useful. Prefer `includeNames: true` for multi-user thread context so Pi can distinguish speakers.
- [ ] Keep the model-facing history surface small: `listThreads` for public channel thread discovery and `readConversationHistory` for public channel/thread reads. Add another tool only if the model cannot complete a real workflow cleanly.
- [ ] Tighten Slack reader-tool privacy gates during broad history work. Gorkie can read DMs it has token access to, which is useful for current DM conversations but dangerous if tools let one user fetch or search another user's private DM context. Scope DM reads to the current DM/thread, block or require explicit approval for cross-DM reads, and make model-facing tool descriptions say private conversations are not general workspace memory.
- [ ] Make prompt text explicit: tell Pi which context was preloaded, the bounds used, and that anything outside those bounds requires calling Slack/Chat tools rather than pretending it saw the whole workspace.
- [ ] Bound by message count first, then add a token/character budget if real Slack threads produce oversized prompts. Trim oldest messages first, preserving the triggering message and direct parent/root.
- [ ] Include attachments only through Chat SDK supported paths. `toAiMessages` can include images and text-like files when `fetchData()` exists; log skipped unsupported attachments without failing the turn.
- [ ] Respect permissions and private-channel access. If Slack history fetch fails, continue with a short context note saying history was unavailable and let Pi use tools if needed.
- [ ] Add tests or harnessed smoke coverage for: thread mention with 50-message cap, channel mention with 20-message cap, DM follow-up, failed history fetch, and attachment-skipping behavior.
- [ ] Live verify in Slack that Gorkie can answer a thread-context question from the preload, and can still call `readConversationHistory` for older or broader context.

## P2 - Reliability Verification

- [ ] Verify sandbox deletion recovery: delete or destroy a stored sandbox, send a follow-up in the same Slack thread, confirm v2 creates a fresh sandbox, re-seeds the mirrored Pi session file, and preserves conversation memory.
- [ ] Verify attachment seeding after a fresh sandbox resume.
- [ ] Verify Slack App Home: open, edit instructions, load preset, save preset, clear instructions.
- [ ] Verify Slack root mention vs reply-only mention vs subscribed thread behavior.
- [ ] Verify Langfuse receives AI SDK spans using `@ai-sdk/otel` + `LangfuseSpanProcessor`. [it doesn't!!]

## P3 - Tool Scope Decisions
- TODO: Markdown rendering is broken in sendMessage, sendMessageToChannel

and buggy in normal responses
- [ ] Investigate a Harness/Pi-native subagent flow for `summarizeThread`. AI SDK has generic tool-called subagent docs, but current Gorkie wiring does not expose a clean way to run a delegated Harness/Pi agent with the same per-turn attempt, sandbox/session shape, and cancellation behavior. Keep the direct AI SDK summary path until that contract is explicit.
- [ ] Evaluate Slack carousel blocks for multi-item tool outputs, especially generated images and file lists. Decide whether carousel output should replace the current repeated file posts, and revisit native Chat SDK streaming once carousel/task rendering is stable.
- [ ] Add a draft-first DM tool flow: Gorkie can prepare a DM or group-DM message for the Acting User, show recipient/body/context, and require explicit approval before any send.
- [ ] Support user-token DM actions only behind per-user authorization: start DMs/group DMs and send messages on behalf of the Acting User when scopes allow it, but never silently fall back to a shared user token.
- [ ] Add edit/cancel/send states for drafted DMs and group DMs. The user should be able to revise generated copy before sending, cancel it without side effects, or send after a clear confirmation.
- [ ] Keep bot-DM and user-DM semantics separate in tool names, prompts, task rows, and logs. `sendDirectMessage` as the bot is not the same as drafting or sending as a user.
- [ ] Add task renderers for DM draft lifecycle: drafting, awaiting approval, edited, sent, canceled, and failed. Avoid dumping raw message bodies into logs/task summaries when the destination is private.
- [ ] Improve scheduled reminders, to say here's your reminder for xyz you asked in this thread, xyz
- [ ] Rewrite and cleanup line-reply, since it has a BUNCH of code, which can just be achieved from asking the ai to do \n\n for every response, like tables, etc. and not to exceed 3k
- [ ] Refactor error message rendering 

## P4 - BYOK Proper

- [x] Add `BYOK_ENCRYPTION_KEY` to bot env validation and deployment docs; require enough entropy for AES-256-GCM key derivation.
- [ ] Add tests for the bot-owned versioned secret encryption helper: round-trip, tamper failure, wrong-key failure, malformed ciphertext, and no plaintext in thrown errors.
- [x] Add `user_model_credentials` Drizzle schema and queries keyed by `(user_id, provider)`; store encrypted key, base URL metadata, provider slug, selected model id, key preview, validation status, validation message, last-used timestamp, and audit timestamps.
- [x] Keep raw BYOK secrets out of `packages/db` query logs and return types unless a bot-owned decrypting service explicitly asks for the encrypted payload.
- [x] Define a single exported provider discriminant union and provider adapter map in `packages/ai` for Pi attempts: OpenRouter-compatible, opencode-go, and any direct provider added later.
- [x] Replace static `chatAttempts` call sites with per-Acting-User attempt resolution: BYOK attempts first, service attempts only when no BYOK exists or explicit service fallback is enabled.
- [x] Update `executeTurn`, `executeCompact`, `nextAttempt`, and attempt logging so provider/model selection is per turn and logs never include raw env or key material.
- [x] Refactor `summarizeThread` to receive a per-turn language model when the BYOK provider can produce one.
- [ ] Make `generateImage` policy explicit in code/UI: service image provider only unless an image-capable BYOK provider is configured.
- [x] Add App Home Model Keys UI: add/rotate/delete credential, provider input, model id input, optional base URL, status display, and masked key preview only.
- [x] Ensure Slack modal `private_metadata`, view state re-renders, prompt hints, Pi session files, E2B env, task renderers, and logs never contain raw API keys.
- [ ] Validate credentials on save or first use, store safe validation status, and surface invalid-key/auth/quota errors to only the Acting User where Slack allows.
- [x] Decide service fallback UX: default off for BYOK failures, with an explicit opt-in if users may spend the shared service key after their key fails.
- [ ] Add tests for provider-to-`customEnv` mapping, BYOK-first fallback order, service fallback disabled, invalid-key handling, App Home modal parsing, and ownership checks.
- [ ] Live smoke: save a key, run a Slack turn, run compaction, rotate the key, delete the key, trigger an invalid-key turn, and verify two users in one thread use separate credentials without leaking provider/key details.

## Upstream AI SDK / Harness Expectations

- [ ] Native MCP support and skill support.
- [ ] Native steering support exposing queued user messages / `submitUserMessage` cleanly.
- [ ] Refactored Pi provider selection that is not ENV-prefix and model-id-order dependent.
- [ ] `ai-retry` support at the Harness/Pi boundary so custom retry logic can be deleted.
- [ ] Native Langfuse / OTel support deep enough for Harness/Pi model/tool/session internals.
- [ ] Official AI SDK E2B provider support with the resume/session-file hooks Gorkie needs.
- [ ] Add Pi-level retry parity from the old implementation so transient provider failures can retry within Pi before Gorkie's outer attempt fallback runs.

## Borked Stuff
- [ ] Normalize user IDs [ping word] to user id & display name. e.g @Uxxxxxxx [@gorkie DEV]
- [ ] Add a prefix by who the message was sent by, e.g twa: make me a website, izie: idk
- [ ] Even though gorkie fetches the profile, it couldn't get a user's pronouns?? [chat sdk bug]
- [ ] When there are more than 50 task items gorkie fails
- [ ] Gorkie doesn't switch model properly
- [ ] "gorkies responses are shaped by instructions", when using custom instructions
- [ ] Commands needs proper timeout, and they should timeout before the sandbox expires:
E.G: Running commandpython3 -m http.server 8080 &
SERVER_PID=$!
sleep 1

echo "Server PID: $SERVER_PID"
ps aux | grep "http.server" | grep -v grep

When this bug occurs it's impossible to stop gorkie
- [ ] 
[2026-06-22 04:19:41.735 +0000] ERROR: [agent] turn failed
    attempt: {
      "model": "qwen3.7-max",
      "provider": "opencode-go"
    }
    threadId: "slack:C0B7QEK0MQB:1782100463.342159"
    err: {
      "type": "Error",
      "message": "524 {\"type\":\"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/\",\"title\":\"Error 524: A timeout occurred\",\"status\":524,\"detail\":\"The origin web server did not return a complete response within the 120-second Proxy Read Timeout window. The connection was established, but the origin took too long to respond.\",\"instance\":\"a0f8717e1ca6634a\",\"error_code\":524,\"error_name\":\"origin_response_timeout\",\"error_category\":\"origin\",\"ray_id\":\"a0f8717e1ca6634a\",\"timestamp\":\"2026-06-22T04:19:31Z\",\"zone\":\"dashscope-us.aliyuncs.com\",\"cloudflare_error\":true,\"retryable\":true,\"retry_after\":120,\"owner_action_required\":true,\"what_you_should_do\":\"**Wait and retry.** Back off for at least 120 seconds. If the error persists, the website operator should check for long-running processes or an overloaded origin.\",\"footer\":\"This error was generated by Cloudflare on behalf of the website owner.\"}",
      "stack":
          Error: 524 {"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/","title":"Error 524: A timeout occurred","status":524,"detail":"The origin web server did not return a complete response within the 120-second Proxy Read Timeout window. The connection was established, but the origin took too long to respond.","instance":"a0f8717e1ca6634a","error_code":524,"error_name":"origin_response_timeout","error_category":"origin","ray_id":"a0f8717e1ca6634a","timestamp":"2026-06-22T04:19:31Z","zone":"dashscope-us.aliyuncs.com","cloudflare_error":true,"retryable":true,"retry_after":120,"owner_action_required":true,"what_you_should_do":"**Wait and retry.** Back off for at least 120 seconds. If the error persists, the website operator should check for long-running processes or an overloaded origin.","footer":"This error was generated by Cloudflare on behalf of the website owner."}
              at <anonymous> (/workspaces/worktrees/gorkie-slack/thermo-cleanup/gorkie-slack/node_modules/.bun/@ai-sdk+harness-pi@1.0.0-beta.11+04cb25890130b012/node_modules/@ai-sdk/harness-pi/dist/index.js:1660:53)
              at processTicksAndRejections (native:7:39)
    }

524: Timeout
- [ ] can you add a thing to ask gorkie to be able to leave a thread even if its pinged in it
- [ ] Enforcing if people are in #gorkie channel is borken in dev

                                                                                                                                                                                                             
  
● You've zeroed in on the real limitation. Let me be precise:

  "Can we force a timeout?" — yes, but it doesn't fix this hang

  You can force the model to set a timeout (required timeout param via a bash override). But that won't rescue the http.server & no-redirect case, and here's why:

  That hang isn't a running command waiting — the script already exited (exit 0). What's stuck is E2B's commands.run waiting for a stdout pipe that an orphaned background process still holds open. A timeout (or a stop) fires an
  abort — but abort/timeout only help if they kill the process that holds the fd. E2B's abort evidently doesn't reap that orphaned child (that's exactly why your Stop "does nothing" here). A timeout would behave the same way — it
  bounds a blocking command, but it can't close a pipe held by a process it isn't killing.
  
  So: forcing a timeout fixes the "blocking command runs too long" case, not the "orphaned bg process leaked the fd" case. Different bug.

  How you actually handle the orphan-fd case

  Only two things truly work:

  (a) Prevent it — prompt rule (cheap, no code surgery):
  Tell the model: background processes must redirect output and detach:
  python -m http.server 8080 > /tmp/s.log 2>&1 &     # redirect frees the fd
  With the redirect, the orphan never holds commands.run's pipe → it returns in ~1 ms → no hang ever. This is the reliable fix for the common case, and it's why the prompt rule matters more than the timeout.

  (b) Reap it — custom bash override (bulletproof):
  This is what opencode does and why theirs can always be stopped: they spawn detached (own process group) and on abort/timeout call kill({ forceKillAfter: "3s" }) on the whole group — SIGTERM then SIGKILL. That reaps the orphan
  even when the model forgets to redirect. The cost is reimplementing bash as a host tool.
  
  So the honest summary

  - A timeout (forced or default) bounds blocking commands — good, do it (8-min ceiling + model-set timeouts).
  - It does not fix the orphaned-bg-fd hang. For that you either prevent it (prompt: redirect+detach) or reap it (custom bash with process-group kill).
  - Stop "not working" is specifically the orphan case — there's no live foreground process for the abort to kill, and E2B isn't reaping the child.
  
  Pragmatic path for Monday: 8-min ceiling + the redirect/background prompt rule (covers ~all real cases). The detached-process-group bash override is the eventual "can never get stuck" upgrade. Want me to do the pragmatic two
  now?
  
✻ Sautéed for 1m 1s

❯ in pi                                                                                                                                                                                                                               

● Short answer: you can't fix the orphan in Pi — Pi doesn't run the process.

  Look at the chain again: Pi's remoteOps.exec only does the signal wiring (the AbortController, the setTimeout, chaining your stop signal). Then it hands off:
  runShell(cmd) → options.sandbox.run({ command, abortSignal })   // ← YOUR E2BSandboxSession
  So Pi never spawns, never kills, never touches a process group. The actual commands.run / kill happens in your packages/sandbox/src/session.ts against E2B. Pi just passes an abort signal down and waits.

  That means:
  - Process-group reaping (the opencode forceKillAfter group-kill) has to live in your sandbox layer, not in Pi. Either in E2BSandboxSession.run (wrap the command in its own group and kill the group on abort/timeout) or in a
  custom bash tool you own. Pi can't do it for you.
  - Pi also has no timeout/default knob. PiHarnessSettings is only { auth, model, thinkingLevel }. harness-pi's exec applies a timer only when the model passes timeout — there's no Pi-level default to set. So "force a default
  timeout in Pi" isn't a thing either.

  So everything you'd want — a default ceiling, forced timeouts, orphan reaping — lands in your code, not Pi:
  - Ceiling/default: config.ts executionTimeoutMs (the timeoutMs you pass to E2B). ✅ easy.
  - Forced timeout param: override bash with a required-timeout host tool. (medium)
  - Orphan reaping / always-killable: custom bash (or session.run) that spawns detached + group-kills on abort. (medium, the real "never stuck" fix)

  Pi gives you the signal plumbing; the process control is yours. So for Monday the realistic lever is still the 8-min ceiling in config.ts + the redirect/background prompt rule, since those are the only ones that don't require
  taking over Pi's bash. Want those two?

✻ Brewed for 48s
- [ ] For some reason gorkie can read threads in private channels fix it
- [ ] Test out leaving thread: verify the `leaveThread` tool actually works end-to-end — ask gorkie to leave, confirm it stops auto-responding to that thread, and confirm it can still be @-mentioned back in.
