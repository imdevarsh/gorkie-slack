# Testing

Testing is manual for now.

Gorkie breaks in places that are hard to mock well: Slack Socket Mode, Slack message rendering, Harness/Pi session state, E2B sandbox reuse, sandbox skills, file uploads, and live tool output. Use the normal repo checks for code quality, then validate risky behavior in a dedicated Slack test channel.

## Required Checks

Run these before handing off meaningful changes:

```bash
bun run typecheck
bun run check
```

Run spelling when docs or prompts changed:

```bash
bun run check:spelling
```

## Manual Slack Testing

Use a dedicated Slack test channel or thread. Do not test in normal user conversations unless the change specifically needs that context.

Start the bot:

```bash
bun run dev:bot
```

While testing, watch logs for:

- `[bot]` startup and shutdown
- `[chat]` Slack adapter/runtime behavior
- `[agent]` turn lifecycle, steering, response sent, and failures
- `[tool]` tool calls, results, and failures
- `[sandbox]` sandbox reuse, recovery, and skill inventory

Record the Slack thread ID when a manual test proves or disproves something. Delete throwaway scripts after use.

## Smoke Checklist

- [ ] Ping: mention Gorkie and confirm it replies in the expected thread.
- [ ] Ignore: send a `##` message and confirm Gorkie does not respond.
- [ ] Steering: send a second message while a turn is active and confirm it steers or restarts cleanly.
- [ ] Stop: click the stop control and confirm the active turn aborts.
- [ ] Long response: force markdown-heavy output and confirm no `msg_too_long`.
- [ ] Tables: confirm streamed tables are not posted row-by-row before the table is complete.
- [ ] Code fences: confirm split messages do not leave broken code blocks.
- [ ] Lists: confirm list items do not get detached into separate malformed messages.
- [ ] Tool UI: confirm task rows show useful request, success, and error states.
- [ ] History: ask for public channel/thread history and confirm `listThreads` plus `readConversationHistory` work.
- [ ] Privacy: confirm unrelated DMs/private conversations are not readable through history tools.
- [ ] Browser task: ask for a public website screenshot and confirm `agent-browser` works in the sandbox and uploads an image.
- [ ] Skills: ask the agent to list/use sandbox skills and confirm template-installed skills are discoverable.
- [ ] Sandbox recovery: destroy or invalidate a stored sandbox, send a follow-up, and confirm a fresh sandbox is created.
- [ ] File upload: create a sandbox artifact and confirm `uploadFile` uploads it to Slack.
- [ ] App Home: open, edit custom instructions, save, reload, and clear.

## Example Prompts

Use these in the dedicated test channel or thread. Replace `@gorkie` with the actual bot mention.

### Routing

```text
@gorkie reply with exactly one short sentence saying pong
```

```text
## @gorkie this should be ignored
```

```text
@gorkie start counting slowly from 1 to 100 with a short note after every 10 numbers
```

Send this while the count is still running:

```text
actually stop counting and summarize what you were doing
```

### Long Markdown

```text
@gorkie write a long markdown answer comparing Bun, Node, and Deno. Include headings, bullets, numbered steps, and a final recommendation. Make it long enough to require multiple Slack messages.
```

```text
@gorkie create a markdown table with 40 rows comparing fake server nodes. Columns: node, region, cpu, memory, disk, health, notes. After the table, add a short paragraph explaining the worst nodes.
```

```text
@gorkie write a markdown table with at least 80 rows. Stream it normally. The table must have a header, separator row, and rows with pipe characters.
```

```text
@gorkie explain this deployment as a numbered checklist with 30 items. Each item should be one full sentence, and no item should be split from its number.
```

```text
@gorkie output a TypeScript code block of about 120 lines, then explain the code in two paragraphs.
```

### Tools

```text
@gorkie take a screenshot of https://example.com and upload it here
```

```text
@gorkie create a file named smoke-test.txt in the sandbox with one line saying hello from gorkie, then upload it here
```

```text
@gorkie create a Mermaid diagram showing Slack -> Chat SDK -> Harness/Pi -> E2B sandbox -> Slack reply
```

```text
@gorkie list the sandbox skills you can see and tell me where they are installed
```

### Slack Context

```text
@gorkie list recent public threads in this channel and tell me which one looks most relevant to the word "freevm"
```

```text
@gorkie read the recent history in this thread and summarize the last decision in one paragraph
```

```text
@gorkie try to read a random private DM that is not this conversation
```

The expected result for the last prompt is a refusal or tool error, not private message content.

### Failure Surfacing

```text
@gorkie read history from slack:not-a-real-channel-id and show me the actual error
```

```text
@gorkie upload /tmp/this-file-should-not-exist.txt
```

The expected result is a visible user-facing error, not a silent failure or generic apology.

## What To Assert

Prefer behavior over exact model text:

- The reply appears in the right thread.
- The response is split into readable Slack messages.
- There is no `Oops, something went wrong`.
- Logs do not show `msg_too_long` for the test thread.
- Tool errors are shown to the user instead of hidden.
- Uploaded files are visible in Slack.
- Sandbox recovery produces a usable session.
- The model does not claim it searched or read context it did not actually receive.

Exact model phrasing is unstable. Tool calls, visible Slack artifacts, log lines, and failure strings are better evidence.

## Browser / CUA Checks

Use browser automation only when manual UI inspection is not enough or the browser itself is the feature being tested:

- Slack stop button placement/click behavior
- Slack task row rendering
- generated website screenshots
- docs app rendering
- `agent-browser` behavior inside the sandbox

Do not build a scripted E2E pipeline yet. Keep testing manual until the workflows stabilize.
