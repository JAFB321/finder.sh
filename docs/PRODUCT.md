# finder.sh — Product

Local-first photo library for a photographer-programmer with ~17k RAW/JPG files spread across `~/Pictures` and external SSDs. Index in place (never move or modify originals), browse fast, tag, and find images through filters that go beyond folders and dates.

## Who

One user (for now). Amateur photographer, Sony A7C, shoots RAW+JPG. Uses Lightroom to edit, not to organize. Wants one place that sees everything.

## Jobs to be done

1. **See everything.** Point at folders (internal + external). Recursive scan. Grid appears within seconds, thumbs fill in progressively.
2. **Browse beautifully.** Layouts: justified, uniform grid, masonry, filmstrip+loupe. Switch instantly, keep scroll position and selection.
3. **Find by feel, not by folder.** Dominant color, "looks like this one", natural language ("neon at night"), near-duplicates.
4. **Organize without moving files.** Color labels, keywords, collections (manual + smart). Keyboard-driven.
5. **Never lose an external drive.** Offline volumes stay browsable from cache; reconnect resyncs.

## MVP scope (iteration 1)

| Area     | In                                                                                                       | Out (later)              |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| Sources  | Add/remove root folders, recursive, watch for changes                                                    | Cloud, Photos.app        |
| Formats  | JPG, PNG, HEIC, TIFF, WebP, ARW, NEF, DNG, CR2/CR3, RAF                                                  | Video (iteration 2), PSD |
| Thumbs   | Embedded RAW preview; 3 cached sizes (256 / 1024 / 2560) WebP                                            | Full RAW develop         |
| Metadata | EXIF essentials (date, camera, lens, focal, ISO, f, shutter, dimensions, GPS)                            | IPTC, XMP import         |
| Layouts  | Justified, uniform grid, masonry, filmstrip+loupe                                                        | Map, timeline            |
| Filters  | Folder, text (filename/keyword), color label, keyword, dominant color, CLIP text, similar-to, duplicates | EXIF range sliders, GPS  |
| Tagging  | Color labels (5, keys 6–9 + 0 clear), keywords w/ autocomplete, collections manual + smart               | Stars, flags, XMP write  |
| RAW+JPG  | Paired into one asset, badge                                                                             | —                        |
| Offline  | Cached thumbs + badge, resync on mount                                                                   | —                        |

## Non-goals

- Editing / developing RAW.
- Multi-user, sync, cloud.
- Writing anything into the user's image files.

## Quality bar

- Grid of 10k items scrolls at 60 fps.
- First thumbs visible < 2 s after adding a folder.
- Full library (17k) indexed (thumbs + EXIF + color + pHash) in < 15 min on M4; CLIP embeddings in background after.
- Every grid action has a keyboard shortcut. Microinteractions are subtle: 120–200 ms, easing, no bounce.

## References

- Eagle — grid density, tag colors, color filter, "premium" feel.
- Peakto — meta-catalog model (index in place).
- Excire Foto — local AI search quality.
- Lightroom Library — keyboard culling model (labels 6–9), filmstrip + loupe.
- Immich — architecture: multi-size thumbs, local CLIP, job queue.
