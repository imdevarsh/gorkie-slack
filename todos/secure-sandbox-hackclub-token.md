# Secure Sandbox HackClub Token

## Problem

`HACKCLUB_API_KEY` is currently passed as an environment variable to the e2b sandbox PTY
in `server/lib/sandbox/rpc/boot.ts`. Since the sandbox AI has a `bash` tool, it can read
the key via:

- `echo $HACKCLUB_API_KEY`
- `printenv`
- `cat /proc/self/environ`
- `cat /proc/<pi-pid>/environ`

The key is used by the `pi` coding agent inside the sandbox to authenticate with the
Hack Club AI proxy (`https://ai.hackclub.com/proxy/v1`), configured via
`server/lib/sandbox/config/auth.json` and `models.json`.

---

## Solution: Vercel Nitro Proxy + Per-Session Tokens

Host a lightweight proxy on Vercel that sits between the sandbox and `ai.hackclub.com`.
The real `HACKCLUB_API_KEY` lives only in Vercel's environment. The sandbox receives a
short-lived per-session UUID token that is meaningless outside the proxy.

### Token Lifecycle

```
sandbox starts (create OR resume)
  → gorkie generates UUID token
  → gorkie writes token to Neon DB (proxy_tokens table)
  → token passed as HACKCLUB_API_KEY env var to sandbox PTY
  → sandbox pi calls Vercel proxy with UUID as Bearer token
  → proxy validates UUID in DB → injects real key → forwards to ai.hackclub.com

sandbox pauses / stops
  → gorkie deletes token from DB
  → UUID is now invalid, proxy rejects any further calls
```

### Data Flow

```
gorkie (homelab, socket mode)      Neon DB            Vercel Nitro proxy
         │                            │                       │
         │  sandbox starts            │                       │
         │──── INSERT proxy_token ───▶│                       │
         │                            │                       │
         │  boot PTY with:            │                       │
         │  HACKCLUB_API_KEY=<uuid>   │                       │
         │  (real key never in env)   │                       │
         │                            │                       │
         │      sandbox pi ───────────────── POST /v1/* ─────▶│
         │                            │◀─── SELECT token ─────│
         │                            │──── row exists ───────▶│
         │                            │             inject real HACKCLUB_API_KEY
         │                            │             forward to ai.hackclub.com
         │                            │                       │
         │  sandbox pauses            │                       │
         │──── DELETE proxy_token ───▶│                       │
         │                            │  UUID now invalid     │
```

Even if the AI reads `HACKCLUB_API_KEY` from its environment, it only sees the UUID.
The UUID can only be used to make AI calls through gorkie's proxy — rate-limited,
logged, and automatically invalidated on pause.

---

## Should We Migrate to Turborepo?

**Short answer: not yet — add it as a follow-up task.**

The proxy is simple enough that it only needs to query one table (`proxy_tokens`) from
Neon. It can define that table inline without sharing the full Drizzle schema.

| | Turborepo/Bun workspaces | Simple subfolder |
|---|---|---|
| Shared DB schema | Yes (`packages/db`) | No — tokens table duplicated |
| Build caching | Yes | No |
| Migration effort | High — all `~/` imports change | None |
| Worth it now | Only if adding more services | Yes for this single feature |

**Recommendation:** Start with `proxy/` as a standalone folder with its own
`package.json`. If more shared packages emerge (e.g. shared types, shared utils),
migrate to Bun workspaces then. Turborepo on top only if build pipeline caching
becomes a pain point.

---

## Implementation Plan

### Phase 1 — DB Schema (gorkie)

**File:** `server/db/schema.ts`

Add `proxyTokens` table:

```ts
export const proxyTokens = pgTable(
  'proxy_tokens',
  {
    token: text('token').primaryKey(),          // UUID v4 — the sandbox's "API key"
    sandboxId: text('sandbox_id').notNull(),
    threadId: text('thread_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // safety net TTL
  },
  (table) => [
    index('proxy_tokens_thread_idx').on(table.threadId),
    index('proxy_tokens_expires_idx').on(table.expiresAt),
  ]
);
```

**File:** `server/db/queries/proxy-tokens.ts` — new file

```ts
createProxyToken(sandboxId, threadId): Promise<string>  // returns the UUID
revokeProxyToken(threadId): Promise<void>               // deletes by threadId
```

**Migration:** `bun drizzle-kit generate` then `bun drizzle-kit migrate`

---

### Phase 2 — Vercel Nitro Proxy

**New folder:** `proxy/` at repo root

```
proxy/
  package.json          — nitro + @neondatabase/serverless + drizzle-orm
  nitro.config.ts       — preset: 'vercel', routeRules for /v1/**
  tsconfig.json
  server/
    db.ts               — minimal Neon/Drizzle connection (tokens table only)
    routes/
      v1/
        [...path].ts    — main proxy handler
```

**`proxy/server/routes/v1/[...path].ts` logic:**

1. Read `Authorization: Bearer <token>` from request
2. Query `proxy_tokens` table: does this token exist and not expired?
3. If invalid → `401 Unauthorized`
4. Strip incoming `Authorization` header
5. Inject `Authorization: Bearer ${process.env.HACKCLUB_API_KEY}`
6. Forward request to `https://ai.hackclub.com/proxy/v1/<path>` with original body/headers
7. Stream response back

**Vercel env vars needed:**
- `DATABASE_URL` — same Neon connection string as gorkie
- `HACKCLUB_API_KEY` — the real key, only lives here

**Token expiry safety net:** `expiresAt = createdAt + 8 hours` (max sandbox session
length). Even if gorkie crashes before revoking, the token auto-invalidates.

---

### Phase 3 — Gorkie Changes

#### 3a. `server/lib/sandbox/rpc/boot.ts`

Change signature to accept a proxy token:

```ts
export async function boot(
  sandbox: Sandbox,
  sessionId?: string,
  proxyToken?: string,
): Promise<PiRpcClient>
```

Change envs:

```ts
envs: {
  HACKCLUB_API_KEY: proxyToken ?? '',   // UUID token, NOT the real key
  AGENTMAIL_API_KEY: env.AGENTMAIL_API_KEY,
  HOME: config.runtime.workdir,
  TERM: PTY_TERM,
},
```

Remove `HACKCLUB_API_KEY` from gorkie's `env.ts` server validation
(it no longer needs to be in gorkie's env — it moves to Vercel only).

#### 3b. `server/lib/sandbox/session.ts`

**`createSandbox`:**
```ts
// After configureAgent, before boot:
const proxyToken = await createProxyToken(sandbox.sandboxId, threadId);
const client = await boot(sandbox, undefined, proxyToken);
```

**`resumeSandbox`:**
```ts
// Revoke old token for this thread, generate fresh one:
await revokeProxyToken(threadId);
const proxyToken = await createProxyToken(sandboxId, threadId);
const client = await boot(sandbox, sessionId, proxyToken);
```

**`pauseSession`:**
```ts
// Revoke token before pausing:
await revokeProxyToken(threadId);
await Sandbox.betaPause(sandboxId, { apiKey: env.E2B_API_KEY });
```

#### 3c. `server/lib/sandbox/config/models.json`

Change `baseUrl` from `https://ai.hackclub.com/proxy/v1` to the Vercel proxy URL.
Either hardcode after deployment, or make it dynamic via `PROXY_BASE_URL` env var
(requires `buildConfig` in `config/index.ts` to interpolate it).

Recommended: add `PROXY_BASE_URL` to `server/env.ts` and inject it in `buildConfig`.

#### 3d. `server/env.ts`

- Remove `HACKCLUB_API_KEY` (no longer needed in gorkie)
- Add `PROXY_BASE_URL: z.string().url()` — the Vercel proxy deployment URL

Also update `.env.example` and `.github/actions/setup/action.yml`.

---

### Phase 4 — Deployment

1. Create Vercel project pointing at `proxy/` subfolder
2. Set `HACKCLUB_API_KEY` and `DATABASE_URL` in Vercel env vars
3. Deploy — note the deployment URL (e.g. `https://gorkie-proxy.vercel.app`)
4. Set `PROXY_BASE_URL=https://gorkie-proxy.vercel.app/v1` in gorkie's `.env`
5. Run DB migration on Neon

---

## Future Improvements

- **`AGENTMAIL_API_KEY`** has the same exposure problem. Apply the same proxy pattern
  once this is stable — either extend this proxy or create a separate AgentMail proxy.
- **Token cleanup cron:** Add a Vercel cron job to delete expired tokens as a failsafe
  for cases where gorkie crashes before calling `revokeProxyToken`.
- **Rate limiting:** Add per-token rate limiting in the proxy using an in-memory or
  Redis counter to prevent a leaked token from burning through the AI budget.
- **Turborepo migration:** Once the proxy matures and more shared code emerges,
  migrate to Bun workspaces with a `packages/db` shared package.

---

## Files Changed Summary

| File | Change |
|---|---|
| `server/db/schema.ts` | Add `proxyTokens` table |
| `server/db/queries/proxy-tokens.ts` | New — `createProxyToken`, `revokeProxyToken` |
| `server/lib/sandbox/rpc/boot.ts` | Accept `proxyToken` param, pass as `HACKCLUB_API_KEY` env |
| `server/lib/sandbox/session.ts` | Create/revoke token on start/resume/pause |
| `server/lib/sandbox/config/models.json` | Update `baseUrl` to Vercel proxy |
| `server/lib/sandbox/config/index.ts` | Inject `PROXY_BASE_URL` into models.json |
| `server/env.ts` | Remove `HACKCLUB_API_KEY`, add `PROXY_BASE_URL` |
| `.env.example` | Update accordingly |
| `.github/actions/setup/action.yml` | Update env var list |
| `proxy/` | New Nitro project — entire folder |
