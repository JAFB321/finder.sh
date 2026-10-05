// worker_threads entry: meta / thumb / visual jobs. No DB access here.
import { parentPort } from 'worker_threads'
import { createHash } from 'crypto'
import { open, mkdir, stat, writeFile, readFile } from 'fs/promises'
import { dirname } from 'path'
import { execFile, spawn } from 'child_process'
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
  | { id: number; kind: 'meta'; path: string; ext: string; isRaw: boolean; isVideo?: boolean }
  | {
      id: number
      kind: 'thumb'
      path: string
      ext: string
      isRaw: boolean
      hash: string
      sizes: number[]
      orientation: number
      isVideo?: boolean
      /** seconds, from the meta job; null = probe again */
      duration?: number | null
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
  if (req.isVideo) return videoMeta(req.path)
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
      lon: num(e.longitude),
      duration: null
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
  const src = req.isVideo
    ? await videoFrame(req.path, req.duration ?? null)
    : await decodableSource(req.path, req.ext, req.isRaw)
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
    img.clone().resize(64, 64, { fit: 'inside' }).removeAlpha().raw().toBuffer()
  ])
  return { phash: phash32(gray).toString(), dominant: dominantColors(rgb, 8) }
}

// ---------- video (ffmpeg) ----------

const FF_TIMEOUT = 15_000

function runFf(
  bin: string,
  args: string[]
): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${bin.split(/[\\/]/).pop()} timed out`))
    }, FF_TIMEOUT)
    child.stdout.on('data', (b: Buffer) => out.push(b))
    child.stderr.on('data', (b: Buffer) => {
      if (err.length < 64 * 1024) err += b.toString()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout: Buffer.concat(out), stderr: err, code: code ?? -1 })
    })
  })
}

interface Probe {
  width: number
  height: number
  duration: number | null
  takenAt: number | null
}

/** Display dimensions, i.e. swapped for portrait clips stored rotated (phones). */
async function probe(path: string): Promise<Probe> {
  if (!ff) throw new Error('ffmpeg not found')
  if (ff.ffprobe) {
    const r = await runFf(ff.ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'format=duration:format_tags=creation_time:stream=width,height:stream_tags=rotate:stream_side_data=rotation',
      '-of',
      'json',
      path
    ])
    if (r.code !== 0) throw new Error(r.stderr.trim().split('\n').pop() || 'ffprobe failed')
    const j = JSON.parse(r.stdout.toString()) as {
      streams?: {
        width?: number
        height?: number
        tags?: { rotate?: string }
        side_data_list?: { rotation?: number }[]
      }[]
      format?: { duration?: string; tags?: { creation_time?: string } }
    }
    const s = j.streams?.[0]
    const rot = num(s?.tags?.rotate) ?? s?.side_data_list?.find((d) => d.rotation != null)?.rotation
    const quarter = Math.abs(Math.round(Number(rot ?? 0) / 90)) % 2 === 1
    const w = s?.width ?? 0
    const h = s?.height ?? 0
    const created = j.format?.tags?.creation_time
    const t = created ? Date.parse(created) : NaN
    return {
      width: quarter ? h : w,
      height: quarter ? w : h,
      duration: num(j.format?.duration),
      takenAt: Number.isFinite(t) && t > 0 ? t : null
    }
  }
  // No ffprobe: `ffmpeg -i` prints container info on stderr and exits 1.
  const { stderr } = await runFf(ff.ffmpeg, ['-hide_banner', '-i', path])
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  const dim = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr)
  const rot = /rotat\w*\s*(?:of|:)?\s*(-?\d+(?:\.\d+)?)/i.exec(stderr)
  const ct = /creation_time\s*:\s*(\S+)/.exec(stderr)
  const quarter = rot ? Math.abs(Math.round(Number(rot[1]) / 90)) % 2 === 1 : false
  const w = dim ? Number(dim[1]) : 0
  const h = dim ? Number(dim[2]) : 0
  const t = ct ? Date.parse(ct[1]) : NaN
  return {
    width: quarter ? h : w,
    height: quarter ? w : h,
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    takenAt: Number.isFinite(t) && t > 0 ? t : null
  }
}

async function videoMeta(path: string): Promise<{ meta: AssetMeta; hash: string }> {
  const [hash, p] = await Promise.all([cheapHash(path), probe(path).catch(() => null)])
  return {
    hash,
    meta: {
      width: p?.width ?? 0,
      height: p?.height ?? 0,
      orientation: 1,
      takenAt: p?.takenAt ?? null,
      camera: null,
      lens: null,
      focal: null,
      iso: null,
      aperture: null,
      shutter: null,
      lat: null,
      lon: null,
      duration: p?.duration ?? null
    }
  }
}

/** One JPEG frame at ~10% in (ffmpeg auto-rotates), capped at 2560 px wide. */
async function videoFrame(path: string, duration: number | null): Promise<Buffer> {
  if (!ff) throw new Error('ffmpeg not found')
  const dur = duration ?? (await probe(path).catch(() => null))?.duration ?? null
  const grab = async (at: number): Promise<Buffer> => {
    const r = await runFf(ff!.ffmpeg, [
      '-v',
      'error',
      '-ss',
      at.toFixed(3),
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      "scale='min(2560,iw)':-2",
      '-f',
      'image2',
      '-c:v',
      'mjpeg',
      '-q:v',
      '3',
      'pipe:1'
    ])
    if (!r.stdout.length) throw new Error(r.stderr.trim().split('\n').pop() || 'ffmpeg: no frame')
    return r.stdout
  }
  const at = dur ? dur * 0.1 : 1
  try {
    return await grab(at)
  } catch (e) {
    if (at === 0) throw e
    return grab(0) // clip shorter than the seek point
  }
}

import { workerData } from 'worker_threads'
const wd = workerData as { thumbsDir: string; ffmpeg?: string | null; ffprobe?: string | null }
thumbsDir = wd.thumbsDir
const ff = wd.ffmpeg ? { ffmpeg: wd.ffmpeg, ffprobe: wd.ffprobe ?? null } : null

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
