/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS build script */
// Rasterises the SVG masters in branding/ into every bitmap the app ships.
// node branding/render.mjs   (macOS: needs iconutil; uses the project's sharp)
import sharp from 'sharp'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const svg = (name) => readFileSync(join(here, name))
// masters are 1024 px at 72 dpi; render at 4× and downsample for clean edges
const png = (name, size) => sharp(svg(name), { density: 288 }).resize(size, size).png().toBuffer()

// ≤32 px use the heavier-stroke small master so the frame survives downsampling
const master = (size) => (size <= 32 ? 'icon-small.svg' : 'icon.svg')

writeFileSync(join(here, 'icon-1024.png'), await png('icon.svg', 1024))
writeFileSync(join(root, 'build', 'icon.png'), await png('icon.svg', 512))
writeFileSync(join(root, 'resources', 'icon.png'), await png('icon.svg', 512))
writeFileSync(
  join(here, 'github-social-preview.png'),
  await sharp(svg('social-preview.svg'), { density: 144 }).resize(1280, 640).png().toBuffer()
)

// macOS .icns via iconutil
const set = join(mkdtempSync(join(tmpdir(), 'finder-sh-icon-')), 'icon.iconset')
execFileSync('mkdir', ['-p', set])
for (const base of [16, 32, 128, 256, 512]) {
  writeFileSync(join(set, `icon_${base}x${base}.png`), await png(master(base), base))
  writeFileSync(join(set, `icon_${base}x${base}@2x.png`), await png(master(base * 2), base * 2))
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'build', 'icon.icns')])
rmSync(dirname(set), { recursive: true, force: true })

// Windows .ico with PNG-compressed entries (Vista+)
const icoSizes = [16, 32, 48, 256]
const images = await Promise.all(icoSizes.map((s) => png(master(s), s)))
const header = Buffer.alloc(6 + 16 * images.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
images.forEach((img, i) => {
  const e = 6 + 16 * i
  const s = icoSizes[i]
  header.writeUInt8(s >= 256 ? 0 : s, e)
  header.writeUInt8(s >= 256 ? 0 : s, e + 1)
  header.writeUInt16LE(1, e + 4)
  header.writeUInt16LE(32, e + 6)
  header.writeUInt32LE(img.length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += img.length
})
writeFileSync(join(root, 'build', 'icon.ico'), Buffer.concat([header, ...images]))

console.log(
  'rendered icon-1024.png, github-social-preview.png, build/icon.{icns,ico,png}, resources/icon.png'
)
