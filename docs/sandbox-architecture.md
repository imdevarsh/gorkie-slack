# Sandbox Architecture

Gorkie delegates Linux/file-processing work to an AI SDK `HarnessAgent` session backed by the Pi harness adapter and a custom E2B sandbox provider. The Slack bot owns orchestration, persistence, and host-executed tools; the sandbox owns filesystem and process execution.

## Current Shape

- `apps/bot/src/lib/ai/tools/chat/sandbox.ts` exposes the chat-facing `sandbox` tool.
- `apps/bot/src/lib/sandbox/session.ts` creates the `HarnessAgent`, resumes or creates a harness session per Slack thread, syncs attachments, and persists resume state.
- `apps/bot/src/lib/sandbox/e2b-provider.ts` implements AI SDK's `HarnessV1SandboxProvider` contract on top of E2B.
- `apps/bot/src/lib/sandbox/tools/index.ts` exposes host-executed AI SDK tools to the harness. `showFile` reads from the restricted sandbox session and uploads the file to Slack.
- `packages/ai/src/prompts/sandbox/*` owns the full sandbox system prompt.
- `packages/db/src/schema/sandbox.ts` stores the thread-to-sandbox runtime mapping and opaque harness resume state.

## Decisions

### Use AI SDK HarnessAgent

The bot uses `HarnessAgent` instead of the previous custom RPC sandbox loop. AI SDK owns the harness stream shape, session lifecycle, built-in tool projection, compaction events, and host-executed tool plumbing. Gorkie keeps only the Slack-specific orchestration: task cards, attachment sync, upload-to-Slack, timeout handling, and persistence.

Old RPC token handling was removed because the sandbox no longer calls back into the bot through a bespoke proxy. Host tools run through AI SDK tool execution, and built-in file/shell tools run inside the harness sandbox.

### Use E2B as a Harness Sandbox Provider

The repo has a custom E2B adapter because AI SDK's initial sandbox providers do not include E2B. The adapter maps E2B file and command APIs to the AI SDK sandbox interface:

- `readTextFile`, `readBinaryFile`, `writeTextFile`, `writeBinaryFile`
- `run` and `spawn`
- `getPortUrl`
- `stop` via E2B pause
- `destroy` via E2B kill
- `restricted()` for host tools so they can access files and commands without lifecycle control

The E2B API key stays in the bot host environment. It is used to create, connect, pause, and kill sandboxes; it is not passed to sandbox commands as an environment variable by the adapter.

### Persist One Sandbox Session Per Slack Thread

The Slack thread ID is the sandbox session ID. A follow-up in the same thread resumes the existing E2B sandbox and harness conversation when possible. The DB stores:

- E2B sandbox ID
- harness session ID
- opaque harness resume state
- lifecycle status and timestamps

`finishSession` detaches active sessions so the sandbox can remain warm, and stops paused sessions when execution times out or fails in a way that should not keep the runtime active.

### Override the Harness Prompt Explicitly

The inference provider used behind the harness rejects certain provider/runtime terms, so Gorkie supplies a complete custom sandbox prompt from `packages/ai/src/prompts/sandbox`. The prompt is written in two places:

- host harness agent directory as `SYSTEM.md`
- sandbox workdir as `.pi/SYSTEM.md` and `.pi/SYSTEM`

The code verifies the sandbox prompt files after writing them. The prompt must avoid provider-blocked terms and describe the runtime as Gorkie's sandbox execution environment.

### Use AI SDK Tools Directly

Sandbox-specific host tools live under `apps/bot/src/lib/sandbox/tools/`. They are plain AI SDK tools, not Pi extensions. `showFile` is host-executed because Slack upload credentials and APIs belong to the bot host, not the sandbox.

Tool task rendering for built-in harness calls is handled from AI SDK stream parts in the chat-facing sandbox tool. Titles, details, and outputs are clamped before they are shown in Slack.

### Keep Chat Model Fallbacks Local

Official AI SDK packages are pinned to the AI SDK 7 canary line for harness support. `@openrouter/ai-sdk-provider` does not yet publish an AI SDK 7-native release, but AI SDK 7's `wrapProvider` can normalize the provider into the v4 model surface used by the rest of the app.

`ai-retry@1.7.4` is not used with these models because it runtime-checks for the AI SDK 6/v3 model contract and gateway-wraps anything else. AI SDK 7 models have `specificationVersion: 'v4'`, so a type cast is not enough and can route calls through Vercel AI Gateway unexpectedly.

`packages/ai/src/providers.ts` owns a small local fallback model wrapper instead. It keeps the behavior Gorkie currently needs: try each configured model, retry short transient errors, log the provider/model that errored, and then move to the next model. Replace this wrapper with `ai-retry` or another library only after that library accepts AI SDK 7/v4 language models at runtime.

### Use Supabase Transaction Pooler

The DB client uses `postgres-js` with `prepare: false` and `ssl: 'require'`. The deployed `DATABASE_URL` should be the Supabase transaction pooler URL, not the direct `db.<project>.supabase.co` host. Direct Supabase DB hosts can resolve IPv6-only in this runtime, while the pooler is the intended application connection path.

## Operational Notes

- Use `bun install --minimum-release-age 0` when refreshing AI SDK canary packages; Bun's default minimum release age rejects fresh canary builds.
- Build the E2B template with `bun run build:sandbox` after changing the sandbox base image script.
- Use `bun --filter=bot run build` to catch bundled production runtime imports. A successful TypeScript build alone is not enough for mixed ESM dependency graphs.
- Use a short `NODE_ENV=production bun run apps/bot/dist/index.mjs` smoke run after dependency changes. In a shell without bot env vars, reaching env validation is enough to prove module loading passed.
