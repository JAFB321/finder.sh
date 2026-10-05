# User feedback log

## 2026-10-04 — first real use (36k files indexed)

| #   | Type    | Item                                                                                                                                                               | Status |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | feature | **Timeline view**: easy-to-navigate time line (research references: Apple Photos, Google Photos scrubber, Immich).                                                 | done   |
| 2   | feature | **Loupe zoom**: show thumb first, load higher-res in background, discreet corner loader while loading. Zoom via mouse wheel, trackpad pinch, drag to pan.          | done   |
| 3   | bug     | **Filmstrip** only renders a window around the cursor; scrolling horizontally to the end shows nothing beyond it. Make it a virtualized strip over the whole list. | done   |
| 4   | feature | **Open in Lightroom** (with icon) for single images and for folders.                                                                                               | done   |
| 5   | change  | **Duplicates** = same base filename (case-insensitive, extension ignored) OR identical bytes (hash). Keep current "Similar to #id" (CLIP) as a separate feature.   | done   |
| 6   | bug     | Loupe: navigating very fast with arrows, main image briefly jumps right as if the sidebar disappeared.                                                             | done   |
| 7   | ux      | Tooltips on every icon button (inspector actions, toolbar, sidebar).                                                                                               | done   |
| 8   | ux      | Indexing never reads "Complete" when some jobs failed (e.g. 34756/36028). Show complete + tooltip with failure breakdown.                                          | done   |
| 9   | perf    | Loupe: preload next/previous image so arrow navigation has no black flash.                                                                                         | done   |
| 10  | bug     | Videos are listed but have no thumbnail (sharp can't decode mp4). Use ffmpeg; if too heavy, ship as experimental flag off by default. → ffmpeg (system or bundled ffmpeg-static), ~0.3 s/clip, ON by default, toggle in ⌘K. Some iPhone .MOV have no rotation metadata and are sideways at the source. | done   |
