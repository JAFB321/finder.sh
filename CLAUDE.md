# The Finder — working harness

Local-first photo library app. Electron + electron-vite + React 19 + TS. SQLite in `~/.thefinder`.
Read `docs/ARCHITECTURE.md` before touching main-process code. Product scope lives in `docs/PRODUCT.md`. Decisions in `docs/DECISIONS.md` (append, never rewrite).

## Toolchain

Node 22 via nvm (`.nvmrc`). Run `source ~/.nvm/nvm.sh && nvm use` before any pnpm command in a fresh shell. Node 20 breaks `@electron/rebuild` and `electron-builder`.

## Commands

```bash
pnpm dev          # electron-vite dev (HMR renderer, restarts main on change)
pnpm check        # typecheck + lint + tests — run before every commit
pnpm test         # vitest (pure logic: layouts, phash, color, db queries)
pnpm build:mac    # dmg
```

## Layout

```
src/main/        Electron main. Owns: DB, indexer, workers, IPC handlers, custom protocols.
  db/            schema.sql, migrations, typed query modules (one file per domain)
  indexer/       scan → jobs → worker pool. Never does image work on main thread.
  workers/       worker_threads entries (indexer.ts, embed.ts). Bundled separately (see electron.vite.config.ts).
  ipc/           one file per IPC domain; registers handlers, validates input.
src/preload/     contextBridge. Exposes `window.api` typed from src/shared/ipc.ts.
src/shared/      types + IPC contract shared main<->renderer. No runtime deps.
src/renderer/    React. features/<domain>/ (components+hooks+store), components/ui/ (primitives), lib/.
docs/            foundations. Keep current.
```

## Rules

- **Perf first.** No image decode/resize/hash on main thread or renderer. Workers only. Grid is virtualized always.
- **IPC contract is typed.** Add to `src/shared/ipc.ts` first, then handler, then preload. `invoke` for request/response, `on` for push (progress, changes).
- **Thumbs via `thumb://` protocol**, never base64 over IPC. Full images via `file://`-backed `asset://`.
- **DB access only in main.** Renderer never sees SQL. Queries are prepared once, in `src/main/db/*.ts`.
- **Tags/labels live in SQLite only.** Never write to user's image files or sidecars.
- **UI:** Tailwind v4 tokens in `src/renderer/src/styles/theme.css`. Radix primitives wrapped in `components/ui/`. Motion via `motion` lib, short (120–200 ms), spring-ish, never blocking.
- **Keyboard is a first-class citizen.** Every action in the grid has a shortcut; keep `docs/SHORTCUTS.md` in sync.
- Commits: conventional (`feat:`, `fix:`, `chore:`), no attribution trailers.
- English for code, UI and docs.

## Test data

User library: `~/Pictures` (~10k files, 5.2k Sony ARW) and `/Volumes/PortableSSD`. For quick tests use a small folder under `~/Pictures/Sony A7c/Places/` (check size with `find <dir> -type f | wc -l`). Headless smoke run:

```bash
THEFINDER_HOME=/tmp/tfhome THEFINDER_SCREENSHOT=/tmp/shot.png pnpm exec electron . --add-root "<folder>"
```
