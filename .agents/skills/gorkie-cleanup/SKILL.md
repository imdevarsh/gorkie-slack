---
name: gorkie-cleanup
description: >
  Use when cleaning or refactoring this Gorkie Slack codebase. Covers the local
  cleanup style: simplifying names, collapsing thin helpers, splitting real
  ownership boundaries, trimming tool schemas, preserving Slack/AI behavior, and
  running the repo validation suite.
---

# Gorkie Cleanup

Clean by reducing jumps, not by adding architecture.

## Pass Shape

1. Read the nearby source first. Do not rename or split from vibes.
2. Find names that describe implementation history instead of current purpose.
   Prefer direct names like `reply`, `turns`, `buildPrompt`, `annotateMentions`.
3. Collapse helpers that only wrap one line or have no ownership. Inline them at
   the call site unless they hide a real boundary.
4. Split files only when a module owns a coherent concept: turn state, compaction,
   sandbox setup, Slack mention annotation, tool factories, task rendering.
5. Make factory naming consistent. If most factories use `*Tool`, fix outliers
   without changing model-facing tool keys.
6. Keep schemas terse. Add `.describe()` only for fields whose contract is not
   obvious from the name.
7. Keep type ownership explicit. Private one-file shapes stay inline; shared or
   exported shapes live in the nearest clear owner `types/` folder. App-wide bot
   shapes can live under `apps/bot/src/types/`. Tool-owned shared shapes use a
   `types/tools/<tool>.ts` path.
8. Remove stale docs and prompts after renames. Search for old names before
   handoff.

## Gorkie-Specific Smells

- `index.ts` files that own lifecycle, state, IO, and helpers at once.
- `create*`, `build*`, `with*`, `resolve*` names that hide a tiny operation.
- Three optional fields where a discriminated shape is clearer.
- Long async closures inside tool factories or object literals.
- User-facing task names that describe internal status instead of the action.
- Exported interfaces living in implementation files when an owned `types/`
  folder is the clearer home.
- Tool-owned shared types outside a `types/tools/` folder.
- Stale prompt/docs references after tool or agent module renames.

## Validation

After code changes, run:

```bash
bun run fix
bun run typecheck
bun run check
bun run check:spelling
bun run check:knip
```

For file moves, deleted exports, or public entry points, also run stale-name
searches with `rg` and, when practical, a non-starting import smoke.
