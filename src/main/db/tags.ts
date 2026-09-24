import type { Collection, Keyword, LibraryFilter } from '@shared/types'
import { getDb, now, tx } from './index'

// ---------- labels ----------

export function setLabel(ids: number[], label: number): void {
  tx((d) => {
    const s = d.prepare(`UPDATE assets SET label = ? WHERE id = ?`)
    for (const id of ids) s.run(label, id)
  })
}

// ---------- keywords ----------

export function listKeywords(prefix?: string): Keyword[] {
  const d = getDb()
  if (prefix) {
    return d
      .prepare(
        `SELECT k.id, k.name, COUNT(ak.asset_id) AS count FROM keywords k LEFT JOIN asset_keywords ak ON ak.keyword_id = k.id
         WHERE k.name LIKE ? ESCAPE '\\' GROUP BY k.id ORDER BY count DESC, k.name LIMIT 30`
      )
      .all(prefix.replace(/[%_\\]/g, '\\$&') + '%') as Keyword[]
  }
  return d
    .prepare(
      `SELECT k.id, k.name, COUNT(ak.asset_id) AS count FROM keywords k LEFT JOIN asset_keywords ak ON ak.keyword_id = k.id GROUP BY k.id ORDER BY count DESC, k.name`
    )
    .all() as Keyword[]
}

export function addKeyword(ids: number[], name: string): void {
  const clean = name.trim()
  if (!clean) return
  tx((d) => {
    d.prepare(`INSERT OR IGNORE INTO keywords(name) VALUES (?)`).run(clean)
    const kid = d
      .prepare(`SELECT id FROM keywords WHERE name = ? COLLATE NOCASE`)
      .pluck()
      .get(clean) as number
    const s = d.prepare(`INSERT OR IGNORE INTO asset_keywords(asset_id, keyword_id) VALUES (?, ?)`)
    for (const id of ids) s.run(id, kid)
    for (const id of ids) syncFts(id)
  })
}

export function removeKeyword(ids: number[], name: string): void {
  tx((d) => {
    const kid = d
      .prepare(`SELECT id FROM keywords WHERE name = ? COLLATE NOCASE`)
      .pluck()
      .get(name) as number | undefined
    if (!kid) return
    const s = d.prepare(`DELETE FROM asset_keywords WHERE asset_id = ? AND keyword_id = ?`)
    for (const id of ids) s.run(id, kid)
    for (const id of ids) syncFts(id)
    d.prepare(
      `DELETE FROM keywords WHERE id = ? AND NOT EXISTS (SELECT 1 FROM asset_keywords WHERE keyword_id = ?)`
    ).run(kid, kid)
  })
}

/** Rebuild the FTS row for one asset. Cheap; called on keyword change and on asset creation. */
export function syncFts(assetId: number): void {
  const d = getDb()
  const a = d.prepare(`SELECT name, dir FROM assets WHERE id = ?`).get(assetId) as
    { name: string; dir: string } | undefined
  if (!a) {
    d.prepare(`DELETE FROM fts WHERE asset_id = ?`).run(assetId)
    return
  }
  const kws = d
    .prepare(
      `SELECT k.name FROM asset_keywords ak JOIN keywords k ON k.id = ak.keyword_id WHERE ak.asset_id = ?`
    )
    .pluck()
    .all(assetId) as string[]
  d.prepare(`DELETE FROM fts WHERE asset_id = ?`).run(assetId)
  d.prepare(`INSERT INTO fts(asset_id, name, folder, keywords) VALUES (?, ?, ?, ?)`).run(
    assetId,
    a.name,
    a.dir.split('/').slice(-3).join(' '),
    kws.join(' ')
  )
}

export function syncFtsMany(ids: number[]): void {
  tx(() => {
    for (const id of ids) syncFts(id)
  })
}

// ---------- collections ----------

interface CRow {
  id: number
  name: string
  smart_filter: string | null
  created_at: number
  count: number
}

export function listCollections(): Collection[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_assets ca WHERE ca.collection_id = c.id) AS count FROM collections c ORDER BY c.name`
    )
    .all() as CRow[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    smartFilter: r.smart_filter ? (JSON.parse(r.smart_filter) as LibraryFilter) : null,
    count: r.count,
    createdAt: r.created_at
  }))
}

export function createCollection(name: string, smart?: LibraryFilter): Collection {
  const info = getDb()
    .prepare(`INSERT INTO collections(name, smart_filter, created_at) VALUES (?, ?, ?)`)
    .run(name, smart ? JSON.stringify(smart) : null, now())
  return listCollections().find((c) => c.id === Number(info.lastInsertRowid))!
}

export function renameCollection(id: number, name: string): void {
  getDb().prepare(`UPDATE collections SET name = ? WHERE id = ?`).run(name, id)
}

export function deleteCollection(id: number): void {
  getDb().prepare(`DELETE FROM collections WHERE id = ?`).run(id)
}

export function addToCollection(id: number, assetIds: number[]): void {
  tx((d) => {
    const s = d.prepare(
      `INSERT OR IGNORE INTO collection_assets(collection_id, asset_id, added_at) VALUES (?, ?, ?)`
    )
    const t = now()
    for (const a of assetIds) s.run(id, a, t)
  })
}

export function removeFromCollection(id: number, assetIds: number[]): void {
  tx((d) => {
    const s = d.prepare(`DELETE FROM collection_assets WHERE collection_id = ? AND asset_id = ?`)
    for (const a of assetIds) s.run(id, a)
  })
}
