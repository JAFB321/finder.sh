import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, renameSync } from 'fs'

const defaultBase = join(homedir(), '.finder.sh')
const legacyBase = join(homedir(), '.thefinder')
const base = process.env.FINDERSH_HOME ?? defaultBase

export const paths = {
  base,
  db: join(base, 'library.db'),
  cache: join(base, 'cache'),
  thumbs: join(base, 'cache', 'thumbs'),
  full: join(base, 'cache', 'full'),
  models: join(base, 'models'),
  logs: join(base, 'logs'),
  config: join(base, 'config.json')
}

/** One-time move of the pre-rename data dir (`~/.thefinder`). Same volume, so the rename is instant. */
export function migrateLegacyHome(): void {
  if (process.env.FINDERSH_HOME) return
  if (existsSync(defaultBase) || !existsSync(legacyBase)) return
  renameSync(legacyBase, defaultBase)
  console.log(`[paths] moved ${legacyBase} -> ${defaultBase}`)
}

export function ensureDirs(): void {
  for (const dir of [paths.base, paths.cache, paths.thumbs, paths.full, paths.models, paths.logs]) {
    mkdirSync(dir, { recursive: true })
  }
}

/** Two-level sharded cache path: thumbs/ab/<hash>_<size>.webp */
export function thumbPath(hash: string, size: number): string {
  return join(paths.thumbs, hash.slice(0, 2), `${hash}_${size}.webp`)
}

/** Full-resolution decode of a RAW/HEIC (on demand, loupe deep zoom): full/ab/<hash>.jpg */
export function fullPath(hash: string): string {
  return join(paths.full, hash.slice(0, 2), `${hash}.jpg`)
}
