import { accessSync, constants } from 'fs'
import { createRequire } from 'module'
import { delimiter, join } from 'path'

export interface FfmpegPaths {
  ffmpeg: string
  ffprobe: string | null
}

const COMMON_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
const exe = (name: string): string => (process.platform === 'win32' ? `${name}.exe` : name)

function executable(p: string | null | undefined): string | null {
  if (!p) return null
  try {
    accessSync(p, constants.X_OK)
    return p
  } catch {
    return null
  }
}

/** Packaged builds unpack the static binaries next to app.asar. */
const unpacked = (p: string): string => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

function staticBinary(pkg: 'ffmpeg-static'): string | null {
  try {
    const mod = createRequire(__filename)(pkg) as string | { path?: string } | null
    const p = typeof mod === 'string' ? mod : mod?.path
    return p ? executable(unpacked(p)) : null
  } catch {
    return null
  }
}

function lookup(name: 'ffmpeg' | 'ffprobe', envDir: string | null): string | null {
  const dirs = [
    ...(envDir ? [envDir] : []),
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
    ...COMMON_DIRS
  ]
  for (const dir of dirs) {
    const hit = executable(join(dir, exe(name)))
    if (hit) return hit
  }
  // no bundled ffprobe (120 MB); without it the worker parses ffmpeg's stderr instead
  return name === 'ffmpeg' ? staticBinary('ffmpeg-static') : null
}

let cached: FfmpegPaths | null | undefined

/**
 * Resolution order: FINDERSH_FFMPEG (binary path or dir), PATH, common install dirs, bundled
 * ffmpeg-static (ffprobe is system-only). Synchronous so the worker pool can get it at construction.
 */
export function resolveFfmpeg(): FfmpegPaths | null {
  if (cached !== undefined) return cached
  const env = process.env.FINDERSH_FFMPEG
  const envBin = env && /ffmpeg(\.exe)?$/i.test(env) ? executable(env) : null
  const envDir = env && !envBin ? env : envBin ? join(envBin, '..') : null
  const ffmpeg = envBin ?? lookup('ffmpeg', envDir)
  cached = ffmpeg ? { ffmpeg, ffprobe: lookup('ffprobe', envDir) } : null
  return cached
}

export async function getFfmpeg(): Promise<FfmpegPaths | null> {
  return resolveFfmpeg()
}
