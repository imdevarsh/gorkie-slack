# Spike: previewing MCP tools before completing OAuth

**Status:** findings delivered (2026-06-13). Spike plan: `plans/008`.
**Verdict:** **GO** — discovery before auth is viable for a meaningful share
of public servers; implement it bot-direct behind an explicit "Preview tools"
button.

## Question

Users adding an MCP server in the App Home can't see what tools it offers
until they finish the full OAuth dance, so they commit auth effort before
seeing the value (`docs/mcp-improvements.md` item 7, TODO.md). Three things
were unknown: (1) do real MCP servers answer `initialize`/`tools/list`
without auth; (2) should discovery run bot-direct or via an `apps/server`
endpoint; (3) where does the preview fit in the Slack add flow.

## 1. Protocol probe (empirical)

Streamable-HTTP JSON-RPC, no credentials, from this environment. Sent
`initialize`, then `tools/list` reusing the returned `mcp-session-id`.

| Server | URL | `initialize` | `tools/list` (no auth) | Notes |
|--------|-----|--------------|------------------------|-------|
| Context7 | `https://mcp.context7.com/mcp` | 200 | ✅ `resolve-library-id`, `query-docs` | Returns `WWW-Authenticate: Bearer` on init yet still serves `tools/list` unauthenticated; auth is enforced at tool-call time, not discovery |
| DeepWiki | `https://mcp.deepwiki.com/mcp` | 200 | ✅ `read_wiki_structure`, `read_wiki_contents`, `ask_question` | No auth challenge at all |
| GitMCP | `https://gitmcp.io/docs` | 200 | ✅ `fetch_generic_documentation`, `search_generic_documentation`, `search_generic_code`, … | No auth challenge |

**Finding.** All three serve `tools/list` without credentials — including
Context7, which advertises a bearer requirement. So discovery-without-auth is
not just a bearer/open-server special case; many OAuth-protected servers gate
only *tool execution*, not *tool listing*. Servers that strictly gate listing
behind auth will fail closed (HTTP 401 or a JSON-RPC error) and must degrade to
"sign in to see tools" — but they appear to be the minority.

Caveat: probed from a dev shell, not through `guardedMCPFetch`. The real path
must reuse the guard (HTTPS-only + SSRF IP validation); none of these hosts
resolve to blocked ranges, so behaviour should match.

## 2. Architecture: bot-direct, not a server endpoint

The bot already owns all MCP egress — `openMCPClient`/`fetchTools` in
`apps/bot/src/lib/mcp/remote.ts` go straight out through `guardedMCPFetch`
(`createMCPClient({ fetch: guardedMCPFetch })`), and every other MCP call in
the app is bot-direct. The TODO.md sketch of an `apps/server`
`GET /mcp/tools` endpoint would add a second egress path and a new auth
surface for no benefit: the Slack handler that renders the modal runs in the
bot, so a server round-trip just adds latency and a hop.

**Recommendation:** add `fetchToolsPreview({ server })` in `remote.ts` that
opens a credential-less client, calls `listTools()`, closes it, and returns
`null` on any auth/transport error. An `apps/server` endpoint is only worth it
later if we want discovery cached off the Slack event loop — defer it.

The one gap: `openMCPClient` currently *requires* a credential. Preview needs a
credential-less client (no bearer header, no OAuth provider) that still uses
`guardedMCPFetch` and `redirect: 'error'`. That is a small additive branch,
not a refactor.

## 3. UX: explicit "Preview tools" button

The add modal (`view/add.ts`) already has a URL input plus transport/auth
selects with `dispatchAction()`, and `actions/auth-changed/` demonstrates the
update-modal-on-input pattern.

- **Option A — `dispatchAction` on the URL input.** Zero extra clicks, but
  fires on every Enter/keystroke-rule event and runs a network `listTools()`
  inside the ~3s modal-update window. Rejected: same per-event-fetch smell
  plan 009 just removed from the tools modal.
- **Option B — explicit "Preview tools" button (recommended).** Reuse the
  open-then-update pattern already in `actions/configure.ts`: render a
  "Loading tools…" state, then `views.update` with the result. Latency is
  tolerable because it's user-initiated and acknowledged; one extra click is a
  fair price and there's no implicit fetch storm.

For servers where discovery fails closed (auth-gated listing, or a transport
error), the preview section shows **"Sign in to see available tools"** rather
than an error — discovery failing is expected, not exceptional.

## 4. Open questions

- **Caching.** Repeated previews of the same URL re-fetch. Fine at human
  click-rate; if abused, cache per `(userId, url)` with a short TTL. The SSRF
  guard already bounds *which* URLs can be hit.
- **Untrusted display data.** Tool names/descriptions from an unconnected,
  user-supplied server are untrusted — clamp and escape exactly as
  `view/tools.ts` does (`formatToolName(...).slice(0, 180)`, `mdText`).
- **Result shape.** Preview should show count + grouped names (reuse
  `toToolEntries`), not modes — there are no permissions yet pre-connect.

## 5. Build-plan outline (if scheduled)

1. `apps/bot/src/lib/mcp/remote.ts`: `fetchToolsPreview({ server })` — a
   credential-less `createMCPClient({ fetch: guardedMCPFetch })`, `listTools()`,
   `close()`, `catch → null`. Reuse the existing transport construction.
2. `view/add.ts`: add a "Preview tools" button block (its own action id).
3. New `actions/preview-tools.ts`: open-then-update like `configure.ts` —
   parse the in-progress modal state for the URL/transport, call
   `fetchToolsPreview`, render a read-only tools section or the
   "Sign in to see available tools" fallback.
4. Register the action in `index.ts`. No DB or schema changes; no `apps/server`
   route.

Estimated size: S–M, isolated to the add flow. Reuses `guardedMCPFetch`,
`mcpServerUrlSchema`, `toToolEntries`, and the configure open-then-update
pattern — no new infrastructure.
