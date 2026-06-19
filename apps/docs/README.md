# Gorkie Docs

The documentation site for Gorkie, built with [fumapress](https://press.fumadocs.dev) on [Waku](https://waku.gg).

Content lives in `content/` and is written as MDX. Keep it compact, practical, and tied to the source files that own each behavior.

## Development

```sh
bun run dev
```

Useful checks:

```sh
bun run typecheck
bun run build
```

These also run from the repo root via Turbo:

```sh
bun run dev        # all apps
bun run typecheck  # all apps
bun run build      # all apps
```
