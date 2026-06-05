# MCP Integration: Improvements & Security Hardening

Reference: [LibreChat MCP implementation](https://github.com/danny-avila/LibreChat), [AI SDK MCP docs](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)

---

## What the AI SDK provides natively

- `@ai-sdk/mcp`: OAuth 2.0 full lifecycle via `OAuthClientProvider` — used ✓
- `createMCPClient`: Streamable HTTP + SSE transport with `authProvider` and `fetchFn` overrides — used ✓
- `redirect: 'error'` in transport config: blocks redirect-based SSRF — used ✓
- `auth()` helper: handles initial auth, PKCE, token exchange, refresh — used ✓

The SDK does **not** provide: timeout enforcement, response size caps, streaming byte limits, or IP-based SSRF validation. These are all handled by `packages/utils/src/guarded-fetch.ts` — keep it.

---

## Improvements

### 1. Field-level lockdown for MCP server config (high priority — security)

LibreChat locks `url`, `auth`, and header fields by default with a permission system (`OBO_USER_EDITABLE_FIELDS`). Only cosmetic fields (name, description) are editable without elevated permissions. This prevents an attacker from modifying an existing server's URL to point at an internal network resource.

**Current gap**: `updateMCPServer` in `packages/db/src/queries/mcp/servers.ts` should stay narrowly typed so Slack modal payloads cannot mutate ownership fields. The `mcpServerUrlSchema` in `@repo/validators` validates the URL format but doesn't prevent a user from changing a previously-audited URL to a new one.

**Fix**: In `apps/bot/src/slack/features/customizations/mcp/views/save/index.ts` and `configure.ts`, restrict which fields can change after first creation. URL and auth type should be immutable once connected — require delete + re-add to change them.

### 2. Atomic OAuth upsert (correctness)

`upsertMCPOAuthConnection` in `packages/db/src/queries/mcp/connections.ts` should remain a single upsert. Two concurrent callback requests (e.g., user double-clicks) must not be able to insert duplicate rows.

**Fix**: Add a unique constraint on `(serverId, userId)` to the `mcp_oauth_connections` table and replace the select+insert pattern with a single `onConflictDoUpdate`.

```ts
// packages/db/src/queries/mcp/connections.ts
await db.insert(mcpOAuthConnections)
  .values(connection)
  .onConflictDoUpdate({
    target: [mcpOAuthConnections.serverId, mcpOAuthConnections.userId],
    set: values,
  });
```

```sql
-- packages/db/src/schema/mcp.ts
uniqueIndex('mcp_oauth_connections_server_user_idx')
  .on(table.serverId, table.userId)
```

### 3. Scope MCP queries by teamId (security — multi-workspace)

Every `getMCPServerById`, `getMCPOAuthConnection`, and related query uses only `userId` as the predicate. If the same Slack user ID exists in two workspaces (possible in Slack Connect or Enterprise Grid), workspace A can read workspace B's MCP servers.

**Fix**: Thread `teamId` through every query function and add it to every `WHERE` clause. The `teamId` is already stored in both the `mcp_servers` and `mcp_oauth_connections` tables.

```ts
// All query functions need:
export async function getMCPServerById({
  id,
  teamId,
  userId,
}: {
  id: string;
  teamId: string;
  userId: string;
})
```

### 4. IPv4-mapped IPv6 SSRF bypass (security)

`packages/utils/src/guarded-fetch.ts` checks for blocked IPv6 prefixes but misses the `::ffff:` prefix used for IPv4-mapped addresses. `https://[::ffff:127.0.0.1]/` bypasses the current checks.

**Fix** (in `guarded-fetch.ts`, or better in `mcpServerUrlSchema` in `@repo/validators`):

```ts
function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isBlockedIpv4(normalized.slice('::ffff:'.length));
  }
  // ... existing checks
}
```

### 5. Proactive token refresh (reliability)

`expiresAt` is stored for OAuth tokens but never checked proactively. Connections silently fail at the moment of use when tokens are expired. LibreChat runs a background refresh 5 minutes before expiry.

**Fix**: Add a Nitro scheduled task `apps/server/src/tasks/mcp/refresh-tokens.ts` that runs every 30 minutes, finds connections expiring within 10 minutes, and calls `auth()` to refresh them. Wire it into `nitro.config.ts` scheduledTasks.

### 6. Approval-queue ordering (correctness)

In `apps/bot/src/slack/features/customizations/mcp/actions/approval.ts`, `updateMCPToolApproval()` writes `status: approved` before the resume job is enqueued. If `getQueue(...).add()` throws, the approval is stuck in an approved-but-not-running state and future button clicks hit the "already handled" guard.

**Fix**: Enqueue the job first, then mark as approved. Or use a two-phase status: `approving → approved` with the DB update happening inside the job itself.

### 7. Tool discovery before full OAuth (UX improvement)

Currently, users can't see available tools until they complete the OAuth flow. LibreChat shows tool names during setup using a discovery-without-auth approach.

**Fix**: Expose a `GET /mcp/tools?serverId=...` endpoint (server app) that tries `listTools()` with whatever credentials exist, returning an empty array on auth failure. Show this in the Slack App Home "add tools" modal before the user connects.

---

## Libraries worth considering

| Library | Reason | Status |
|---|---|---|
| `unstorage` | Already used via Nitro for server assets | ✓ in use |
| `@ai-sdk/mcp` | OAuth + MCP client | ✓ in use |
| `arctic` (from lucia-auth) | Typed OAuth 2.0 providers — could replace hand-rolled PKCE if MCP provider needs custom OAuth | consider for non-MCP flows |
| `zod` | Already used for all validation | ✓ in use |

No new major library additions are required. The main wins are fixes to existing patterns (atomic DB ops, field lockdown, IPv6 handling), not new dependencies.

---

## Priority order

1. **Atomic OAuth upsert** — data integrity bug, easy to fix
2. **IPv4-mapped IPv6 SSRF bypass** — security hole, 5-line fix
3. **teamId scoping** — multi-workspace security, medium lift
4. **Approval-queue ordering** — correctness bug in approval flow
5. **Field lockdown** — security hardening, requires UX consideration
6. **Proactive token refresh** — reliability, low urgency
7. **Tool discovery before auth** — UX improvement, lowest priority
