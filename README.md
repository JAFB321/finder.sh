# finder.sh

A local-first photo library for macOS. Point it at the folders where your photos already live (internal disk or external drives), and it indexes them in place: fast virtualized grid, RAW+JPG pairing, color labels, keywords, collections, dominant-color and "looks like this" search, and natural-language search with on-device CLIP. Nothing is uploaded, and your image files are never modified.

<!-- screenshots: TODO -->

## Features

- **See everything.** Recursive scan of any number of roots, file watching, offline drives stay browsable from cache.
- **Browse fast.** Justified, grid, masonry, timeline and filmstrip+loupe layouts; 10k+ items at 60 fps.
- **Find by feel.** Dominant color, similar images, near-duplicates, text search ("neon at night") via CLIP running locally.
- **Organize without touching files.** Color labels, keywords and collections live in a local SQLite database, never in your images or sidecars.
- **Keyboard first.** Every grid action has a shortcut: see [docs/SHORTCUTS.md](docs/SHORTCUTS.md).

Formats: JPG, PNG, HEIC, TIFF, WebP, ARW, NEF, DNG, CR2/CR3, RAF, plus common video files.

## Install (macOS, Apple Silicon)

Download the `.dmg` and drag **finder.sh** to Applications.

The app is not signed or notarized yet, so macOS quarantines it on first launch. Either right-click the app → **Open**, or clear the flag:

```bash
xattr -d com.apple.quarantine /Applications/finder.sh.app
```

Your library index and thumbnail cache live in `~/.finder.sh`.

## Development

Requires Node 22 (see `.nvmrc`) and pnpm.

```bash
nvm use
pnpm install
pnpm dev          # electron-vite dev server with HMR
pnpm check        # typecheck + lint + tests
pnpm build:mac    # unsigned arm64 DMG in dist/
```

## Docs

- [Product](docs/PRODUCT.md): scope and quality bar
- [Architecture](docs/ARCHITECTURE.md): processes, data dir, indexer, headless hooks
- [Decisions](docs/DECISIONS.md): why things are the way they are
- [Shortcuts](docs/SHORTCUTS.md)
- [Roadmap](docs/ROADMAP.md)

## License

[MIT](LICENSE)
