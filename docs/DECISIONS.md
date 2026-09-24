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
