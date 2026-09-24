// worker_threads entry: meta / thumb / visual jobs. No DB access here.
import { parentPort } from 'worker_threads'
import { createHash } from 'crypto'
import { open, mkdir, stat, writeFile, readFile } from 'fs/promises'
import { dirname } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import exifr from 'exifr'
import type { AssetMeta, DominantColor } from '@shared/types'
import { dominantColors, phash32 } from '../indexer/visual'

const exec = promisify(execFile)
sharp.cache(false)
sharp.concurrency(1) // one thread per worker; the pool provides parallelism

type Req =
  | { id: number; kind: 'meta'; path: string; ext: string; isRaw: boolean }
  | {
      id: number
      kind: 'thumb'
      path: string
      ext: string
      isRaw: boolean
      hash: string
      sizes: number[]
      orientation: number
    }
  | { id: number; kind: 'visual'; thumb: string }

const BROWSER_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

async function cheapHash(path: string): Promise<string> {
  const st = await stat(path)
  const fh = await open(path, 'r')
  try {
    const len = Math.min(st.size, 256 * 1024)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, 0)
    return createHash('sha1')
      .update(buf)
      .update(`${st.size}:${Math.floor(st.mtimeMs)}`)
      .digest('hex')
  } finally {
    await fh.close()
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function meta(
  req: Extract<Req, { kind: 'meta' }>
): Promise<{ meta: AssetMeta; hash: string }> {
  const [hash, ex] = await Promise.all([
    cheapHash(req.path),
    exifr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .parse(req.path, <any>{
        tiff: true,
        exif: true,
        gps: true,
        ifd0: true,
        ifd1: false,
        interop: false,
        translateValues: true,
        reviveValues: true,
        pick: [
          'Make',
          'Model',
          'LensModel',
          'FocalLength',
          'ISO',
          'FNumber',
          'ExposureTime',
          'DateTimeOriginal',
          'CreateDate',
          'Orientation',
          'ImageWidth',
          'ImageHeight',
          'ExifImageWidth',
          'ExifImageHeight',
          'latitude',
          'longitude'
        ]
      })
      .catch(() => null)
  ])
  const e = (ex ?? {}) as Record<string, unknown>
  let width = num(e.ExifImageWidth) ?? num(e.ImageWidth) ?? 0
  let height = num(e.ExifImageHeight) ?? num(e.ImageHeight) ?? 0
  if ((!width || !height) && !req.isRaw) {
    try {
      const m = await sharp(req.path, { failOn: 'none' }).metadata()
      width = m.width ?? 0
      height = m.height ?? 0
    } catch {
      /* dims come later from thumb */
    }
  }
  const orientation =
    typeof e.Orientation === 'number'
      ? e.Orientation
      : orientationFromString(e.Orientation as string | undefined)
  if (orientation >= 5 && width && height) [width, height] = [height, width]
  const date = (e.DateTimeOriginal ?? e.CreateDate) as Date | string | undefined
  let takenAt: number | null = null
  if (date instanceof Date && !isNaN(date.getTime())) takenAt = date.getTime()
  else if (typeof date === 'string') {
    const d = new Date(date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'))
    if (!isNaN(d.getTime())) takenAt = d.getTime()
  }
  const make = String(e.Make ?? '').trim()
  const model = String(e.Model ?? '').trim()
  return {
    hash,
    meta: {
      width,
      height,
      orientation,
      takenAt,
      camera: model
        ? model.toLowerCase().startsWith(make.toLowerCase())
          ? model
          : `${make} ${model}`.trim()
        : null,
      lens: e.LensModel ? String(e.LensModel) : null,
      focal: num(e.FocalLength),
      iso: num(e.ISO),
      aperture: num(e.FNumber),
      shutter: num(e.ExposureTime),
      lat: num(e.latitude),
      lon: num(e.longitude)
    }
  }
}

function orientationFromString(s: string | undefined): number {
  if (!s) return 1
  const map: Record<string, number> = {
    'Horizontal (normal)': 1,
    'Rotate 180': 3,
    'Rotate 90 CW': 6,
    'Rotate 270 CW': 8,
    'Mirror horizontal': 2,
    'Mirror vertical': 4
  }
  return map[s] ?? 1
}

/** Returns a sharp-decodable source (Buffer or path) for any supported file. */
async function decodableSource(
  path: string,
  ext: string,
  isRaw: boolean
): Promise<Buffer | string> {
  if (isRaw) {
    const { extractThumbnail } = await import('extract-raw-preview')
    const r = await extractThumbnail(path)
    if (r.found) return Buffer.from(r.data)
    return await sipsFallback(path)
  }
  if (ext === 'heic' || ext === 'heif') {
    try {
      await sharp(path, { failOn: 'none' }).metadata()
      return path
    } catch {
      return await sipsFallback(path)
    }
  }
  return path
}

/** macOS: use ImageIO via sips for formats sharp can't decode (HEVC HEIC, previewless RAW). */
async function sipsFallback(path: string): Promise<Buffer> {
  if (process.platform !== 'darwin') throw new Error('undecodable format')
  const out = join(
    tmpdir(),
    `tf-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  )
  await exec('sips', [
    '-s',
    'format',
    'jpeg',
    '-s',
    'formatOptions',
    '85',
    '-Z',
    '2560',
    path,
    '--out',
    out
  ])
  const buf = await readFile(out)
  void writeFile(out, '').catch(() => {})
  return buf
}

async function thumb(
  req: Extract<Req, { kind: 'thumb' }>
): Promise<{ width: number; height: number }> {
  const src = await decodableSource(req.path, req.ext, req.isRaw)
  const base = sharp(src, { failOn: 'none', limitInputPixels: false })
  const m = await base.metadata()
  // Embedded RAW previews carry no orientation tag; apply the RAW's own orientation explicitly.
  let img = base.clone()
  if (req.isRaw) {
    const angle = { 3: 180, 6: 90, 8: 270 }[req.orientation as 3 | 6 | 8] ?? 0
    if (angle) img = img.rotate(angle)
  } else {
    img = img.rotate() // auto-orient from EXIF
  }
  const sizes = [...req.sizes].sort((a, b) => b - a)
  let previous: Buffer | null = null
  for (const size of sizes) {
    const dir = dirname(thumbFile(req.hash, size))
    await mkdir(dir, { recursive: true })
    const source = previous ? sharp(previous) : img.clone()
    const buf = await source
      .resize({
        width: size,
        height: size,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3'
      })
      .webp({ quality: size <= 256 ? 78 : 84, effort: 3 })
      .toBuffer()
    await writeFile(thumbFile(req.hash, size), buf)
    previous = buf
  }
  const rotated = !req.isRaw && (m.orientation ?? 1) >= 5
  const w = m.width ?? 0
  const h = m.height ?? 0
  const rawRot = req.isRaw && (req.orientation === 6 || req.orientation === 8)
  return rotated || rawRot ? { width: h, height: w } : { width: w, height: h }
}

let thumbsDir = ''
function thumbFile(hash: string, size: number): string {
  return join(thumbsDir, hash.slice(0, 2), `${hash}_${size}.webp`)
}

async function visual(
  req: Extract<Req, { kind: 'visual' }>
): Promise<{ phash: string; dominant: DominantColor[] }> {
  const img = sharp(req.thumb)
  const [gray, rgb] = await Promise.all([
    img.clone().resize(32, 32, { fit: 'fill' }).grayscale().raw().toBuffer(),
    img.clone().resize(48, 48, { fit: 'inside' }).removeAlpha().raw().toBuffer()
  ])
  return { phash: phash32(gray).toString(), dominant: dominantColors(rgb, 5) }
}

import { workerData } from 'worker_threads'
thumbsDir = (workerData as { thumbsDir: string }).thumbsDir

parentPort!.on('message', async (req: Req) => {
  try {
    let result: unknown
    if (req.kind === 'meta') result = await meta(req)
    else if (req.kind === 'thumb') result = await thumb(req)
    else if (req.kind === 'visual') result = await visual(req)
    else throw new Error('unknown job')
    parentPort!.postMessage({ id: req.id, ok: true, result })
  } catch (e) {
    parentPort!.postMessage({ id: req.id, ok: false, error: (e as Error).message ?? String(e) })
  }
})

export { BROWSER_EXTS }
