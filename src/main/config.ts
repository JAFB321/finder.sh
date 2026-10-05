import { readFileSync, writeFileSync } from 'fs'
import type { AppConfig } from '@shared/types'
import { paths } from './paths'

export const DEFAULT_CONFIG: AppConfig = {
  // ffmpeg grabs one frame in ~0.4 s per clip (4K H.264 / HEVC), cheap enough to keep on.
  indexVideos: true
}

let current: AppConfig | null = null
/** Keys we don't know about are preserved on write. */
let raw: Record<string, unknown> = {}

export function getConfig(): AppConfig {
  if (current) return current
  try {
    const parsed: unknown = JSON.parse(readFileSync(paths.config, 'utf8'))
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>
  } catch {
    /* missing or corrupt: defaults */
  }
  current = { ...DEFAULT_CONFIG }
  if (typeof raw.indexVideos === 'boolean') current.indexVideos = raw.indexVideos
  return current
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig() }
  if (typeof patch.indexVideos === 'boolean') next.indexVideos = patch.indexVideos
  current = next
  writeFileSync(paths.config, JSON.stringify({ ...raw, ...next }, null, 2))
  return next
}
