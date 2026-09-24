import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

const base = process.env.THEFINDER_HOME ?? join(homedir(), '.thefinder')

export const paths = {
  base,
  db: join(base, 'library.db'),
  cache: join(base, 'cache'),
  thumbs: join(base, 'cache', 'thumbs'),
  models: join(base, 'models'),
  logs: join(base, 'logs'),
  config: join(base, 'config.json')
}

export function ensureDirs(): void {
  for (const dir of [paths.base, paths.cache, paths.thumbs, paths.models, paths.logs]) {
    mkdirSync(dir, { recursive: true })
  }
}

/** Two-level sharded cache path: thumbs/ab/<hash>_<size>.webp */
export function thumbPath(hash: string, size: number): string {
  return join(paths.thumbs, hash.slice(0, 2), `${hash}_${size}.webp`)
}
