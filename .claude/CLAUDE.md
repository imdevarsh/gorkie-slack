# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.

---

## Project Notes (Gorkie Slack bot)

> **Keep this section current.** Whenever you add, remove, or change a feature
> (a new agent tool, a changed scope, a config flag, gating rules, etc.), update
> the relevant note below in the same change. Treat these notes as living
> documentation — stale notes are worse than none.

### Pull requests
- Open PRs against the **upstream main repo**, not the fork or the codex branch.
  - Base repo: `imdevarsh/gorkie-slack`, base branch: `main`.
  - `origin` is the personal fork (`Devansh-awat/gorkie-slack`); `upstream` is the main repo.
  - `gh`'s default repo is already set to `imdevarsh/gorkie-slack`, so:
    `gh pr create --base main --head Devansh-awat:<branch>`

### AI tools
- Agent tools live in `apps/bot/src/lib/ai/tools/` and are registered in
  `apps/bot/src/lib/ai/toolset.ts`. Each tool returns `{ success, error?, summary? }`
  and uses `errorMessage()` + `logger.warn` on failure (follow the existing files).
- Raw Slack Web API access is via `slack.webClient.apiCall(method, args)` from `@/lib/chat`.
- Canvas tools: `canvasRead`, `canvasWrite`, `canvasList`, `canvasDelete` (need
  `canvases:read/write`, `files:read` scopes). Also added: `pinMessage`,
  `unpinMessage`, `bookmarkLink`, `createChannel`, `setChannelTopic`, `poll`,
  `getPermalink`, `fetchUrl`.
- Slack app scopes are declared in `slack-manifest.json` — update it when a tool
  needs a new scope (e.g. `pins:write`, `canvases:write`, the `user` `chat:write`).

### Send/edit-as-owner
- `sendAsUser` posts AS the owner using `SLACK_USER_TOKEN` (xoxp). Defaults to the
  current thread; pass `channelId` to post a top-level message in any channel.
- `editAsUser` edits one of the owner's own messages via `chat.update` (Slack only
  lets the user token edit its own messages). Defaults to the current channel; pass
  `channelId` for another channel.
- Both are gated two ways: only **registered** when `message.author.userId === OWNER_USER_ID`
  (in `toolset.ts`, so it only fires when the owner mentions the bot), and each tool
  **re-checks** the author at execute time via `checkOwner()` as defense-in-depth.
  Other users mentioning the bot can never trigger them.
- Config in `apps/bot/.env`: `SLACK_USER_TOKEN`, `OWNER_USER_ID`. Requires the
  `chat:write` **user** scope on the Slack app (declared under `oauth_config.scopes.user`).

### Static site hosting
- `deploySite` / `removeSite` tools publish prebuilt static sites at
  `https://<host>/gorkiesites/<name>/`. Code lives in `apps/bot/src/lib/sites/`:
  `paths.ts` (name validation + path containment), `deploy.ts` (copy built files
  out of the E2B sandbox), `server.ts` (the HTTPS host).
- **Security invariant: the host NEVER executes site code.** All building/testing
  happens in the E2B sandbox; only static output is copied to the host and served.
  Site names are DNS-label validated; every served/written path is contained to the
  site root via `resolveWithin` (traversal, encoded separators, and symlinks — via
  `find -type f` — are all rejected). Deploys stage then atomically swap.
- The server starts from `apps/bot/src/index.ts` (`startSitesServer`), binds
  `SITES_PORT` (default 443) with a self-signed cert generated under
  `SITES_ROOT/.tls`. Bind failures are logged, not fatal.
- Config in `apps/bot/.env`: `SITES_ENABLED`, `SITES_PORT`, `SITES_ROOT`,
  `SITES_PUBLIC_HOST`. If you add dynamic/server-side hosting later, it MUST run in
  a sandbox/container, never directly on this host.

### Sandbox / E2B
- Config in `packages/sandbox/src/config.ts`. Idle keep-alive `timeoutMs` is **5 min**
  (sandboxes pause after 5 min idle to limit E2B credit burn); `executionTimeoutMs` is 20 min.
- Only sandbox/code-execution work bills E2B; the Slack tools above are free HTTP calls.
