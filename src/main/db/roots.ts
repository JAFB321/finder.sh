import { basename } from 'path'
import { existsSync } from 'fs'
import type { Root } from '@shared/types'
import { getDb, now } from './index'

interface Row {
  id: number
  path: string
  name: string
  volume_uuid: string | null
  added_at: number
  last_scan_at: number | null
  file_count: number
}

function toRoot(r: Row): Root {
  return {
    id: r.id,
    path: r.path,
    name: r.name,
    volumeUuid: r.volume_uuid,
    online: existsSync(r.path),
    addedAt: r.added_at,
    lastScanAt: r.last_scan_at,
    fileCount: r.file_count
  }
}

export function listRoots(): Root[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM assets a WHERE a.root_id = r.id) AS file_count
       FROM roots r ORDER BY r.added_at`
    )
    .all() as Row[]
  return rows.map(toRoot)
}

export function getRoot(id: number): Root | null {
  const r = getDb()
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM assets a WHERE a.root_id = r.id) AS file_count
       FROM roots r WHERE r.id = ?`
    )
    .get(id) as Row | undefined
  return r ? toRoot(r) : null
}

export function addRoot(path: string): Root {
  const d = getDb()
  const existing = d.prepare('SELECT id FROM roots WHERE path = ?').pluck().get(path) as
    number | undefined
  if (existing) return getRoot(existing)!
  const volume = path.startsWith('/Volumes/') ? path.split('/')[2] : null
  const info = d
    .prepare('INSERT INTO roots(path, name, volume_uuid, added_at) VALUES (?, ?, ?, ?)')
    .run(path, basename(path) || path, volume, now())
  return getRoot(Number(info.lastInsertRowid))!
}

export function removeRoot(id: number): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare('DELETE FROM fts WHERE asset_id IN (SELECT id FROM assets WHERE root_id = ?)').run(id)
    d.prepare(
      'DELETE FROM vec_clip WHERE asset_id IN (SELECT id FROM assets WHERE root_id = ?)'
    ).run(BigInt(id))
    d.prepare('DELETE FROM roots WHERE id = ?').run(id)
  })()
}

export function touchRootScan(id: number): void {
  getDb().prepare('UPDATE roots SET last_scan_at = ? WHERE id = ?').run(now(), id)
}
