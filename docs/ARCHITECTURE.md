# Architecture

## Processes

```
┌──────────────── Electron main (Node) ────────────────┐
│  ipc/*          typed handlers (invoke) + push (send)  │
│  db/            better-sqlite3 (WAL) + FTS5 + sqlite-vec│
│  indexer/       scanner → job queue → WorkerPool       │
│  services/      thumbs protocol, volumes, model dl     │
│      │                                                 │
│      ├── workers/indexer.ts  ×(cores-2)  sharp, exifr, │
│      │        extract-raw-preview, phash, color        │
│      └── workers/embed.ts    ×1          transformers.js│
└───────────────┬───────────────────────────────────────┘
                │ contextBridge (preload) — window.api
┌───────────────┴───────── Renderer (React) ───────────┐
│  features/library  grid + layouts (virtualized)       │
│  features/filters  filter bar, color picker, search   │
│  features/tags     labels, keywords, collections      │
│  features/inspector  EXIF panel, similar, duplicates  │
│  features/loupe    filmstrip + full view              │
└───────────────────────────────────────────────────────┘
```

## Data dir `~/.thefinder/`

```
library.db          SQLite, WAL mode
cache/thumbs/<ab>/<hash>_<size>.webp    256 | 1024 | 2560 (long edge)
models/             ONNX CLIP weights (downloaded on first use)
config.json         roots, ui prefs
logs/
```

## Core tables (see `src/main/db/schema.sql`)

- `roots` — user-added folders. `volume_uuid` for external drives.
- `files` — one row per physical file. `path`, `root_id`, `size`, `mtime`, `content_hash` (xxhash of first 1 MB + size + mtime, cheap), `ext`, `kind` (image|video|sidecar).
- `assets` — logical image. RAW+JPG pairs collapse to one asset (`primary_file_id`, `raw_file_id`, `jpg_file_id`). All user metadata hangs off assets.
- `asset_meta` — EXIF essentials, `width`, `height`, `taken_at`, `camera`, `lens`, `focal`, `iso`, `aperture`, `shutter`, `lat`, `lon`, `orientation`.
- `asset_visual` — `phash` (64-bit), `dominant` (top-5 colors as packed RGB + weight), `lab_mean`.
- `asset_labels` — `asset_id`, `label` (0–5).
- `keywords`, `asset_keywords`.
- `collections`, `collection_assets`; smart collections store a filter JSON.
- `vec_clip` — sqlite-vec virtual table, 512-d float, keyed by asset_id.
- `fts` — FTS5 over filename, folder, keywords.
- `jobs` — persistent queue (`kind`, `asset_id`, `state`, `attempts`), survives restarts.

## Pipeline

1. **Scan** (main, async fs.walk): upsert `files`, mark missing as `missing` (not deleted). Pairs RAW+JPG by (dir, basename). Emits `assets` immediately so grid can render placeholders with aspect ratio unknown → after `meta` job, aspect ratio known.
2. **Jobs** in priority order per asset: `meta` (EXIF via exifr, ~5 ms) → `thumb` (embedded preview or sharp decode → 3 WebP sizes) → `visual` (pHash + dominant colors from the 256 thumb) → `embed` (CLIP from 1024 thumb, separate single worker).
3. **Priority**: visible-in-viewport assets get bumped (renderer sends `viewport` hints). Everything else FIFO.
4. **Watch**: chokidar on roots, debounced, feeds scan.

## Thumbs

- RAW: `extract-raw-preview` → embedded JPEG (Sony: 1616×1080) → sharp → WebP sizes. No RAW decode in MVP. If preview missing → sharp attempts decode; if fail → `sips` fallback on macOS.
- Served via `thumb://<asset_id>?s=256` custom protocol from cache path. Renderer uses plain `<img>` with `loading="lazy"` + `decoding="async"`.
- 2560 size only generated on demand (loupe), then cached.

## Search

- Text: FTS5 (filename, folder path segments, keywords) merged with CLIP text→image when query has ≥ 2 words or no FTS hits.
- Color: query color → Lab; rank by min ΔE against each asset's top-5 dominant colors weighted.
- Similar: `vec_clip` KNN (cosine) top 100, fallback to pHash hamming ≤ 10 when embeddings missing.
- Duplicates: same base filename across folders (case-insensitive, ext ignored) OR identical bytes. Byte check: same size → `quick_hash` (first+last 64 KB) → full sha1 (`files.full_hash`), hashed lazily in the background (4 concurrent) with `duplicates:progress` pushes. pHash is only the fallback for "Similar to" when no CLIP embedding exists.
- Videos: ffmpeg frame at 10 % of duration → same WebP chain; ffprobe for duration/size/creation_time (fallback: parse ffmpeg stderr). `indexVideos` in `~/.thefinder/config.json`.

## IPC contract

`src/shared/ipc.ts` declares `Invoke` (request→response map) and `Push` (event→payload map). Preload generates `window.api.invoke(name, arg)` and `window.api.on(event, cb)`. Renderer hooks wrap them in `useQuery`-style hooks with cache keyed by filter JSON.

## Performance rules

- Grid queries return `{id, w, h, label, hasThumb}` only; pages of 500. Full asset detail fetched on selection.
- Layout computation (justified/masonry) is pure and memoized on `[ids, widths, containerWidth, rowHeight]`; runs in renderer main thread (fast: O(n)) — move to a Web Worker if > 50k.
- Worker pool size = `max(2, cpus - 2)`; embed worker = 1 (ONNX uses its own threads).
- SQLite: `PRAGMA journal_mode=WAL; synchronous=NORMAL; mmap_size=256MB; cache_size=-64000`. Batched inserts in transactions of 500.

## Headless verification hooks (dev)

Main process honours a few env vars / flags so the app can be driven without a human:

- `THEFINDER_HOME=<dir>` — use an isolated data dir instead of `~/.thefinder`.
- `--add-root <path>` — register a folder at startup (no dialog).
- `THEFINDER_SCREENSHOT=<png>` (+ `THEFINDER_SCREENSHOT_DELAY` ms) — capture the window once.
- `THEFINDER_STEPS='[{"wait":ms,"eval":"<js in renderer>","shot":"<png>"}]'` — scripted scenario. The renderer exposes `window.__tf` (zustand store) and `window.api`.
- Renderer console errors/warnings are relayed to stdout as `[renderer:error] …`.

`backgroundThrottling` is disabled on the window so `capturePage` returns a fresh frame even when unfocused.
