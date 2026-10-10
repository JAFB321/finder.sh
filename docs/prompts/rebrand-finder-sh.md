# Task: rename "The Finder" → "finder.sh" and create its branding

You are working in the Electron + React 19 + TypeScript repo at `/Users/jafb321/personal-projects/the-finder` (a local-first photo library app). Read `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` first. Toolchain: Node 22 (nvm default), pnpm 12 at `/Users/jafb321/Library/pnpm/bin/pnpm`. `pnpm check` = typecheck + lint + tests and must stay green. Do not run `pnpm dev` without asking (the user may have it open). Never touch `~/.thefinder` destructively: it holds a 36k-file index.

Two deliverables, in this order. **Part B starts with questions to the user; do not design anything before they answer.**

## Part A — Rename

Naming rules:

| Where | Value |
|---|---|
| GitHub repo | `finder.sh` |
| `package.json` `name` | `finder-sh` |
| Product / window title / UI strings / DMG name | `finder.sh` |
| Electron `appId` | `sh.finder.app` |
| Data dir | `~/.finder.sh` |
| Env hooks | `FINDERSH_HOME`, `FINDERSH_STEPS`, `FINDERSH_SCREENSHOT`, `FINDERSH_SCREENSHOT_DELAY`, `FINDERSH_FFMPEG`, `FINDERSH_VERBOSE` |
| Local folder | **keep** `~/personal-projects/the-finder` as is (do NOT rename or move it) |

Steps:
1. `grep -rni "the-finder\|thefinder\|the finder\|THEFINDER" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=out .` and replace every occurrence consistently: `package.json`, `electron-builder.yml`, `src/main/paths.ts`, `src/main/index.ts` (window title, setAppUserModelId, env hooks), `src/renderer/index.html` `<title>`, UI strings, `README.md`, `CLAUDE.md`, all of `docs/`, test fixtures, prettier/eslint ignores. Keep the git history (no re-init).
2. **Data-dir migration**: on startup, if `~/.finder.sh` does not exist and `~/.thefinder` does, `fs.renameSync` the old dir to the new one (same volume, instant) and log it. The `FINDERSH_HOME` env var still overrides everything.
3. Add `repository`, `homepage`, `description`, `license: MIT` and a `LICENSE` file to `package.json`/repo. Write a real `README.md` (what it is, screenshots placeholder, install from DMG + quarantine note, dev setup, docs links).
4. `pnpm check`, then `pnpm build:mac` and launch the packaged app headlessly (hooks in `docs/ARCHITECTURE.md`, now with `FINDERSH_*` names) to confirm it still indexes a folder. Commit as `chore: rename to finder.sh`.
5. Update the two memory notes that mention the old name if you have access to the user's Claude memory dir (`~/.claude/projects/*/memory/the-finder-*.md`): rename files/slugs and update `MEMORY.md`; otherwise list what should change in your final report.

## Part B — Branding & logo

The name is a wink at shell scripts (`finder.sh`): a *finder* for photos, built by a programmer who shoots. The app UI is dark, quiet, premium (see `src/renderer/src/styles/theme.css` tokens: bg `#0b0b0d`, accent `#7c9cff`). It must feel like a tool, not a consumer photo app.

**First, ask the user (one message, numbered, with options to pick from and your own recommendation marked):**
1. Direction: terminal-flavoured (monospace, `$ finder.sh`, prompt cursor) vs. photographic (aperture/viewfinder/frame) vs. a blend. Show 3 one-line concepts.
2. Mark style: wordmark only / monogram / abstract mark + wordmark.
3. Colour: single accent on dark (which hue?) vs. duotone vs. monochrome.
4. Tone: playful (the `.sh` joke front and centre) vs. understated.
5. Where it must work: macOS app icon (rounded square, light + dark dock), DMG, GitHub social preview, README header, favicon, in-app empty state. Confirm the list.
6. Typeface preference (e.g. JetBrains Mono, Inter, Geist, Berkeley Mono if licensed) or "you choose".

Then, using the design tooling available in your session (the Artifact `design` type / `artifact-design` skill if present; otherwise inline SVG), produce **2–3 directions** as a single page the user can compare (mark + wordmark, on dark and light, at 1024 px and 32 px), get a pick, iterate once, then deliver the final kit:

- `branding/logo.svg` (mark + wordmark), `branding/mark.svg`, `branding/wordmark.svg`, light and dark variants.
- macOS app icon: `branding/icon-1024.png` following Apple's rounded-square grid with proper padding (the system masks it; do not pre-round the corners for the DMG background), then `build/icon.icns` via `iconutil` (iconset with 16→1024 @1x/@2x) and `resources/icon.png` (512 px). Replace the Electron placeholders currently in `build/` and `resources/`.
- `branding/github-social-preview.png` 1280×640, `branding/readme-header.svg`, favicon for `src/renderer/index.html` is not needed (Electron) — skip.
- A short `branding/README.md`: colours (hex), fonts, clear-space, don'ts.
- Wire it: `electron-builder.yml` icon paths, `README.md` header, and (optional, small) the empty-state illustration in `src/renderer/src/features/library/Grid.tsx` `Empty` component.
- Rebuild the DMG and show the user a screenshot of the Dock/Finder icon at real size (`sips` or a headless screenshot).

Commit as `feat: finder.sh branding and app icon`. Final report: what was decided in the questions, files produced, and anything left open.
