---
name: coding-best-practices
description: >
  Code quality rules for the Gorkie Slack bot. Use when reviewing files for
  violations, auditing PRs, or deciding how to structure new code. Covers
  TypeScript patterns, Slack modal conventions, and architecture rules specific
  to this repo.
---

## How to use this skill

Read the rules below, then read the target files and report every violation with:
- File path and line numbers
- Which rule is violated
- Concrete suggested fix

Only report real issues. If a file is clean, say so in one line.

---

## Rules

### 1. Minimal interfaces
Accept only what the callee uses. When an SDK type carries more than needed, export a smaller internal type and convert at the boundary.

```ts
// bad — callee must fabricate fake SDK objects
toolsModal({ tools: ListToolsResult['tools'] })

// good
export type ToolEntry = { name: string; group: GroupSlug };
toolsModal({ tools: ToolEntry[] })
```

### 2. No fabricated data
Never construct fake objects (empty descriptions, synthetic annotations, placeholder schemas) to satisfy a type. The type is wrong — narrow it.

### 3. Export shared type discriminants
When multiple files check the same string literals (`'ro' | 'dt' | 'gn'`, `'allow' | 'ask' | 'block'`), export a named union from one canonical location. Never re-validate the same literals with inline comparisons across files.

### 4. No large inline closures
Async closures longer than ~20 lines inside object literals belong in named functions at module scope with explicit parameter types.

```ts
// bad
tools[name] = { execute: async (input, opts) => { /* 100 lines */ } }

// good
tools[name] = { execute: wrapMCPToolExecute({ ctxId, server, stream, ... }) }
```

### 5. Nested metadata over flat parallel fields
Fields that always move together should be nested.

```ts
// bad
{ serverId: server.id, serverName: server.name, toolName }

// good
{ server: { id: server.id, name: server.name }, tool: { name: toolName } }
```

### 6. Slack private_metadata: minimal and Zod-parsed
Only persist what cannot be re-derived from view state or a DB lookup. Always parse with Zod — never cast with `as`.

```ts
// bad
const meta = JSON.parse(view.private_metadata || '{}') as SomeMeta;

// good
const meta = someMetaSchema.parse(JSON.parse(view.private_metadata || '{}'));
```

### 7. Don't scrape view state to reconstruct stored data
If a handler reads `body.view.state.values` for every element just to rebuild a structure for re-rendering, that structure should have been in `private_metadata`. Only scrape view state for values the user actively changed in this action.

### 8. Always pass `hash` on mid-session `views.update`
`block_actions` handlers must pass `hash: view.hash` to `client.views.update`. This prevents overwriting a view that a concurrent action already updated.

### 9. Dict params
Functions with more than one parameter take a single options object.

```ts
// bad
logReply(ctxId, author, result, reason);
// good
logReply({ ctxId, author, result, reason });
```

### 10. Inline over extract (single-use)
Only extract to a named function when called in multiple places or genuinely complex. A helper called once is worse than the inline code.

### 11. No type casts
Prefer schema parsing or narrower signatures over `as`. A cast is acceptable only at a real validated external boundary.

### 12. Config for tuneable values
Magic numbers and strings that could change per deployment belong in `apps/bot/src/config.ts`.

---

## Also check

- Missing `await` on promises (fire-and-forget is only acceptable for intentional background work)
- Empty or swallowed `catch` blocks
- Ownership checks before DB mutations (user should only affect their own resources)
- `views.update` without `hash` in action handlers (race condition)
