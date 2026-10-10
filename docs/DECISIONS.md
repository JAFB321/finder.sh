# Decisions (ADR log — append only)

## 2026-09-23 — Electron over Tauri

Node ecosystem (better-sqlite3, sharp, sqlite-vec, transformers.js) ready without bindings; single Chromium target; HMR iteration speed. Tauri revisited if native perf needed → napi-rs hot paths first.

## 2026-09-23 — Embedded RAW previews, no RAW decode in MVP

Measured on Sony A7C ARW (49 MB): embedded 1616×1080 JPEG extracted in ~20 ms; full Apple RAW decode ~1.8 s. Grid + medium view from preview; full decode deferred to loupe 100% zoom (future).

## 2026-09-23 — Metadata only in SQLite

No XMP sidecars, no writes to originals. Export to XMP possible later as an explicit action.

## 2026-09-23 — Tagging model

Color labels (5) + keywords + collections. No stars/flags in MVP (user choice).

## 2026-09-23 — RAW+JPG paired into one asset

Same dir + basename → one asset, badge. Labels/keywords apply to the asset.

## 2026-09-23 — Offline volumes stay visible

Files on unmounted volumes remain browsable from cache with a badge; scan resyncs on mount. `files.status` = ok | missing | offline.

## 2026-09-23 — CLIP in MVP as background job

`@huggingface/transformers` ONNX in a dedicated worker, runs after thumbs/visual. Model: `Xenova/clip-vit-base-patch32` (512-d) to start; swap to SigLIP/MobileCLIP later if quality/speed warrants.

## 2026-09-23 — exifr over exiftool

exifr is pure JS, ~5 ms/file, covers EXIF essentials for TIFF-based RAW (ARW/NEF/DNG). exiftool-vendored kept as future fallback for exotic formats.

## 2026-10-04 — Timeline view: sectioned justified grid + labelled scrubber

Research (feedback #1):

- **Apple Photos** — Years / Months / Days / All Photos as zoom levels; coarser levels summarise, Days is a dense grid with date headers. Zoom by pinch or Cmd+1..4.
- **Google Photos (web)** — continuous grid with per-day headers; a right-edge scrubber that fades in on scroll/hover, shows year ticks, a floating date pill while hovering/dragging, and jumps on click/drag.
- **Immich** (Svelte, not React) — same model: month buckets (`TimelineMonth`/`TimelineDay`), virtualised per bucket, sticky month/day headers, scrubber whose segment heights are proportional to each bucket's _rendered height_, not to elapsed time; label shows Month/Year while scrolling.
- **Lightroom Classic / Capture One** — date tree (Year › Month › Day) in a side panel as a filter. Precise but slow to skim; we already have folder/filter UI for that.

Chosen design (desktop + keyboard-first): Google/Immich model, no separate zoom screens. Layout `timeline` (key `Y`; `5` is taken by the purple label) = justified rows split into sections by `takenAt` (Day / Month / Year, `Auto` = by thumb size, `[` `]` to change), undated assets in a final "Unknown date" section. `computeLayout` takes optional `sections` and returns `headers`, so `navigate()`, `BoxIndex` and selection keep working unchanged. One absolutely positioned floating header (pushed up by the next header) instead of CSS sticky inside the virtual canvas. Scrubber maps pointer ↔ scroll offset linearly (like Immich), so ticks land where their section reaches the top and dragging is continuous; it fades from 40 % to 100 % on scroll/hover. Timeline order (takenAt desc, undated last) is applied client-side over the server order instead of rewriting `filter.sort`: works for any filter (similar-to, random), switching layouts never refetches 36k tiles, and leaving the timeline restores the server order.

## 2026-10-10 — Renamed to finder.sh

New name `finder.sh` (a wink at shell scripts): a finder for photos, built by a programmer who shoots. Package `finder-sh`, appId `sh.finder.app`, data dir `~/.finder.sh` (old `~/.thefinder` is renamed on first launch), env hooks `FINDERSH_*`. The local checkout folder keeps its old name.
