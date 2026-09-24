import { opendir, stat } from 'fs/promises'
import { join, basename, extname } from 'path'
import { IMAGE_EXTS, RAW_EXTS, VIDEO_EXTS } from '@shared/types'
import type { ScannedFile } from '../db/assets'
import { upsertScannedFiles, markMissing, setRootOffline } from '../db/assets'
import { listRoots, touchRootScan } from '../db/roots'
import { enqueue } from '../db/jobs'
import { syncFtsMany } from '../db/tags'
import { existsSync } from 'fs'

const SKIP_DIRS = new Set([
  'node_modules',
  '@eaDir',
  '.thumbnails',
  'Thumbs',
  '$RECYCLE.BIN',
  'System Volume Information'
])
const BATCH = 800

export interface ScanEvents {
  onBatch: (rootId: number, newAssetIds: number[], scanned: number) => void
  onDone: (rootId: number) => void
}

async function* walk(dir: string): AsyncGenerator<string> {
  let handle
  try {
    handle = await opendir(dir)
  } catch {
    return
  }
  for await (const entry of handle) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

function classify(path: string): Pick<ScannedFile, 'ext' | 'kind' | 'isRaw'> | null {
  const ext = extname(path).slice(1).toLowerCase()
  if (RAW_EXTS.has(ext)) return { ext, kind: 'image', isRaw: true }
  if (IMAGE_EXTS.has(ext)) return { ext, kind: 'image', isRaw: false }
  if (VIDEO_EXTS.has(ext)) return { ext, kind: 'video', isRaw: false }
  return null
}

let scanning = 0
export const isScanning = (): boolean => scanning > 0

export async function scanRoot(rootId: number, ev: ScanEvents): Promise<void> {
  const root = listRoots().find((r) => r.id === rootId)
  if (!root) return
  if (!existsSync(root.path)) {
    setRootOffline(rootId, true)
    ev.onDone(rootId)
    return
  }
  setRootOffline(rootId, false)
  scanning++
  const scanId = Date.now()
  let batch: ScannedFile[] = []
  let scanned = 0
  const flush = (): void => {
    if (!batch.length) return
    const changed = upsertScannedFiles(rootId, batch, scanId)
    if (changed.length) {
      enqueue(changed)
      syncFtsMany(changed)
    }
    ev.onBatch(rootId, changed, scanned)
    batch = []
  }
  try {
    for await (const path of walk(root.path)) {
      const c = classify(path)
      if (!c) continue
      let st
      try {
        st = await stat(path)
      } catch {
        continue
      }
      const name = basename(path)
      batch.push({
        path,
        dir: path.slice(0, path.length - name.length - 1),
        base: name.slice(0, name.length - c.ext.length - 1).toLowerCase(),
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        ...c
      })
      scanned++
      if (batch.length >= BATCH) flush()
    }
    flush()
    markMissing(rootId, scanId, true)
    touchRootScan(rootId)
  } finally {
    scanning--
    ev.onDone(rootId)
  }
}
