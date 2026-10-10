# finder.sh brand

The mark is a camera viewfinder, four corner brackets, with a prompt chevron `›` where the focus point would be. It reads as a viewfinder to photographers and as a prompt to programmers. Keep it quiet: the `.sh` is a wink, not the joke.

## Files

| File                                               | Use                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `logo-on-dark.svg` / `logo-on-light.svg`           | Mark + wordmark lockup                                                                                                 |
| `mark-on-dark.svg` / `mark-on-light.svg`           | Mark alone (avatars, in-app)                                                                                           |
| `wordmark-on-dark.svg` / `wordmark-on-light.svg`   | Wordmark alone                                                                                                         |
| `icon.svg`                                         | macOS app icon master, 1024 grid (body 824 px at 100 px inset, continuous-corner squircle, baked shadow)               |
| `icon-small.svg`                                   | Same icon with heavier strokes, used for the 16 and 32 px renditions                                                   |
| `icon-1024.png`                                    | Rendered app icon                                                                                                      |
| `readme-header.svg`                                | README banner (has its own dark background, so it works in both GitHub themes)                                         |
| `social-preview.svg` → `github-social-preview.png` | 1280×640 GitHub social preview (upload in repo Settings → Social preview)                                              |
| `render.mjs`                                       | Rebuilds every bitmap: `icon-1024.png`, `github-social-preview.png`, `build/icon.{icns,ico,png}`, `resources/icon.png` |

All text is outlined to paths, so no font has to be installed to render the SVGs. After editing an SVG master, run `node branding/render.mjs` (macOS, Node 22).

## Colour

| Token           | Hex                   | Where                                                    |
| --------------- | --------------------- | -------------------------------------------------------- |
| Ink on dark     | `#f2f3f7`             | Brackets, `finder`                                       |
| Accent on dark  | `#7c9cff`             | Chevron, `.sh` (same as the app's `--color-accent`)      |
| Ink on light    | `#141418`             | Brackets, `finder`                                       |
| Accent on light | `#4a6cf7`             | Chevron, `.sh` (a darker accent so it holds up on white) |
| Muted           | `#8a8a96`             | Taglines on dark                                         |
| Icon night      | `#1f2843` → `#0c0d12` | Icon background, top to bottom                           |
| App background  | `#0b0b0d`             | Banners, screenshots                                     |

Use one accent only. The chevron and `.sh` are the only accented parts.

## Type

- **Wordmark:** JetBrains Mono Medium, tracking −2 %, all lower case, always `finder.sh` with the dot.
- **Taglines and supporting text:** JetBrains Mono Regular. Inside the app the body face stays Inter.

## Clear space and size

- Keep clear space around the lockup at least one bracket arm long, about 22 % of the mark's height, on every side.
- In the lockup the mark is 1.5× the wordmark's height, with a gap of 0.42 em between them. Don't re-space it by eye: use the SVG.
- Minimum sizes: 16 px for the mark (use `icon-small.svg` at 32 px and below) and 96 px wide for the lockup.

## Don'ts

- Don't recolour the brackets in the accent, and don't add a second accent colour.
- Don't add a cursor block, `$` or `_` to the wordmark or the mark. We tried it, and it reads as a terminal app.
- Don't pre-round or crop `icon-1024.png` for other uses. It already sits on Apple's grid, padding and shadow included.
- Don't set the wordmark in another typeface or in capitals.
- Don't put the mark on busy photos without a dark scrim behind it.
