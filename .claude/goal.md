# Refactoring Goals

## Completed

### 1. App-home view component split
- [x] `view.ts` → `view/index.ts` + `view/_components/custom-instructions.ts` + `view/_components/scheduled-tasks.ts`
- [x] Deleted old `view.ts`

### 2. Move `home_cancel_task` to features
- [x] `features/customizations/scheduled-tasks/actions/cancel-task.ts`
- [x] `features/customizations/scheduled-tasks/index.ts`
- [x] `features/customizations/index.ts` updated
- [x] Removed from `app-home-opened/index.ts`

### 3. Import style: `import *` (gork-slack pattern)
- [x] `noNamespaceImport` turned off in `biome.jsonc`
- [x] `features/customizations/prompts/index.ts` uses `import *`
- [x] `features/customizations/scheduled-tasks/index.ts` uses `import *`
- [x] Removed now-dead suppression comment in `db/index.ts`

### 4. Simplify `!stop`
- [x] Clears queue only — no silencing
- [x] Works on ping AND DM (trigger.type === 'ping' || 'dm')
- [x] Removed `setSilenced/isSilenced/clearSilenced` from `kv.ts`
- [x] Removed `silence` from `config.ts`

## Known gaps

- `!stop` clears queue but cannot abort an in-flight AI generation (no AbortController wired up)
- Sandbox kill on stop: tracked at `server/lib/sandbox/session.ts` — needs per-ctxId session registry
