import type {
  AssetDetail,
  AssetFile,
  AssetMeta,
  AssetTile,
  DominantColor,
  LibraryFilter
} from '@shared/types'
import { AssetFlag } from '@shared/types'
import { getDb, now, tx } from './index'
import type { DuplicateCluster } from '@shared/ipc'
import { hexToRgb, rgbToLab, dominantColors } from '../indexer/visual'

export interface ScannedFile {
  path: string
  dir: string
  base: string
  ext: string
  kind: 'image' | 'video' | 'other'
  isRaw: boolean
  size: number
  mtime: number
}

const TILE_COLS = `a.id, a.width AS w, a.height AS h, a.label, a.thumb_state AS thumb, a.flags, a.taken_at AS takenAt, CASE WHEN a.flags & 8 THEN (SELECT m.duration FROM asset_meta m WHERE m.asset_id = a.id) END AS dur`

let durationColumn = false
/** Libraries created before videos were indexed lack asset_meta.duration. */
function ensureDurationColumn(d: ReturnType<typeof getDb>): void {
  if (durationColumn) return
  try {
    d.exec(`ALTER TABLE asset_meta ADD COLUMN duration REAL`)
  } catch {
    /* already there */
  }
  durationColumn = true
}

// ---------- scan / upsert ----------

/**
 * Upsert files for a root and (re)build assets by pairing RAW+JPG on (dir, base).
 * Returns ids of assets that are new or whose primary file changed (need re-indexing).
 */
export function upsertScannedFiles(rootId: number, files: ScannedFile[], scanId: number): number[] {
  ensureFullHash()
  return tx((d) => {
    const selFile = d.prepare('SELECT id, size, mtime, asset_id FROM files WHERE path = ?')
    const insFile = d.prepare(
      `INSERT INTO files(root_id, path, dir, base, ext, kind, is_raw, size, mtime, status, seen_scan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?)`
    )
    const updFile = d.prepare(
      `UPDATE files SET size = ?, mtime = ?, status = 'ok', seen_scan = ? WHERE id = ?`
    )
    const clearHash = d.prepare(`UPDATE files SET full_hash = NULL, quick_hash = NULL WHERE id = ?`)
    const touched = new Set<string>() // dir\0base keys needing asset (re)pairing
    const changed = new Set<number>()

    for (const f of files) {
      const row = selFile.get(f.path) as
        { id: number; size: number; mtime: number; asset_id: number | null } | undefined
      if (!row) {
        insFile.run(
          rootId,
          f.path,
          f.dir,
          f.base,
          f.ext,
          f.kind,
          f.isRaw ? 1 : 0,
          f.size,
          f.mtime,
          scanId
        )
        touched.add(`${f.dir}\0${f.base}`)
      } else {
        updFile.run(f.size, f.mtime, scanId, row.id)
        if (row.size !== f.size || row.mtime !== f.mtime) {
          clearHash.run(row.id)
          touched.add(`${f.dir}\0${f.base}`)
          if (row.asset_id) changed.add(row.asset_id)
        }
      }
    }

    // Pair: for every touched (dir, base), pick primary (RAW > image > video) and attach all files to one asset.
    const filesFor = d.prepare(
      `SELECT id, ext, kind, is_raw, size, mtime, asset_id FROM files WHERE dir = ? AND base = ? AND kind != 'other' ORDER BY is_raw DESC, id`
    )
    const insAsset = d.prepare(
      `INSERT INTO assets(root_id, dir, name, primary_file_id, kind, mtime, size, flags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const updAsset = d.prepare(
      `UPDATE assets SET primary_file_id = ?, name = ?, kind = ?, mtime = ?, size = ?, flags = (flags & ~1) | ? WHERE id = ?`
    )
    const attach = d.prepare(`UPDATE files SET asset_id = ? WHERE id = ?`)

    for (const key of touched) {
      const [dir, base] = key.split('\0')
      const group = filesFor.all(dir, base) as {
        id: number
        ext: string
        kind: string
        is_raw: number
        size: number
        mtime: number
        asset_id: number | null
      }[]
      if (!group.length) continue
      const primary = group[0]
      const hasImage = group.some((g) => g.kind === 'image')
      const hasRaw = group.some((g) => g.is_raw === 1)
      const pairFlag =
        hasRaw && group.some((g) => g.kind === 'image' && g.is_raw === 0) ? AssetFlag.Pair : 0
      const kind = hasImage ? 'image' : primary.kind
      const name = `${base}.${primary.ext}`
      let assetId = group.find((g) => g.asset_id)?.asset_id ?? null
      if (!assetId) {
        const info = insAsset.run(
          rootId,
          dir,
          name,
          primary.id,
          kind,
          primary.mtime,
          primary.size,
          pairFlag | (kind === 'video' ? AssetFlag.Video : 0),
          now()
        )
        assetId = Number(info.lastInsertRowid)
      } else {
        updAsset.run(primary.id, name, kind, primary.mtime, primary.size, pairFlag, assetId)
      }
      for (const g of group) if (g.asset_id !== assetId) attach.run(assetId, g.id)
      changed.add(assetId)
    }
    return [...changed]
  })
}

/** After a full scan of a root: files not seen this scan -> missing; assets with all files missing get Missing flag. */
export function markMissing(rootId: number, scanId: number, online: boolean): void {
  tx((d) => {
    const status = online ? 'missing' : 'offline'
    d.prepare(
      `UPDATE files SET status = ? WHERE root_id = ? AND seen_scan != ? AND status = 'ok'`
    ).run(status, rootId, scanId)
    if (online)
      d.prepare(`UPDATE files SET status = 'ok' WHERE root_id = ? AND seen_scan = ?`).run(
        rootId,
        scanId
      )
    const flag = online ? AssetFlag.Missing : AssetFlag.Offline
    d.prepare(
      `UPDATE assets SET flags = flags | ? WHERE root_id = ? AND NOT EXISTS (SELECT 1 FROM files f WHERE f.asset_id = assets.id AND f.status = 'ok')`
    ).run(flag, rootId)
    d.prepare(
      `UPDATE assets SET flags = flags & ~6 WHERE root_id = ? AND EXISTS (SELECT 1 FROM files f WHERE f.asset_id = assets.id AND f.status = 'ok')`
    ).run(rootId)
    // drop assets with no files at all (e.g. after file delete + re-pair)
    d.prepare(
      `DELETE FROM assets WHERE root_id = ? AND NOT EXISTS (SELECT 1 FROM files f WHERE f.asset_id = assets.id)`
    ).run(rootId)
  })
}

export function setRootOffline(rootId: number, offline: boolean): void {
  tx((d) => {
    if (offline) {
      d.prepare(`UPDATE files SET status = 'offline' WHERE root_id = ? AND status = 'ok'`).run(
        rootId
      )
      d.prepare(`UPDATE assets SET flags = flags | ? WHERE root_id = ?`).run(
        AssetFlag.Offline,
        rootId
      )
    } else {
      d.prepare(`UPDATE files SET status = 'ok' WHERE root_id = ? AND status = 'offline'`).run(
        rootId
      )
      d.prepare(`UPDATE assets SET flags = flags & ~? WHERE root_id = ?`).run(
        AssetFlag.Offline,
        rootId
      )
    }
  })
}

// ---------- job result writes ----------

export function primaryPath(
  assetId: number
): { path: string; ext: string; isRaw: boolean; hash: string | null } | null {
  const r = getDb()
    .prepare(
      `SELECT f.path, f.ext, f.is_raw, a.content_hash FROM assets a JOIN files f ON f.id = a.primary_file_id WHERE a.id = ?`
    )
    .get(assetId) as
    { path: string; ext: string; is_raw: number; content_hash: string | null } | undefined
  return r ? { path: r.path, ext: r.ext, isRaw: r.is_raw === 1, hash: r.content_hash } : null
}

/** Oriented pixel size + EXIF orientation of an asset (for the full-resolution decode). */
export function dims(assetId: number): { width: number; height: number; orientation: number } {
  const r = getDb()
    .prepare(
      `SELECT a.width, a.height, m.orientation FROM assets a LEFT JOIN asset_meta m ON m.asset_id = a.id WHERE a.id = ?`
    )
    .get(assetId) as
    { width: number | null; height: number | null; orientation: number | null } | undefined
  return { width: r?.width ?? 0, height: r?.height ?? 0, orientation: r?.orientation ?? 1 }
}

/** Primary file paths (RAW for RAW+JPG pairs) of assets that are online. */
export function primaryPaths(ids: number[]): string[] {
  if (!ids.length) return []
  return getDb()
    .prepare(
      `SELECT f.path FROM assets a JOIN files f ON f.id = a.primary_file_id
       WHERE a.id IN (SELECT value FROM json_each(?)) AND f.status = 'ok'`
    )
    .pluck()
    .all(JSON.stringify(ids)) as string[]
}

export function writeMeta(assetId: number, m: AssetMeta, hash: string): void {
  ensureDurationColumn(getDb())
  tx((d) => {
    d.prepare(
      `UPDATE assets SET width = ?, height = ?, taken_at = ?, content_hash = ? WHERE id = ?`
    ).run(m.width, m.height, m.takenAt, hash, assetId)
    d.prepare(
      `INSERT OR REPLACE INTO asset_meta(asset_id, orientation, camera, lens, focal, iso, aperture, shutter, lat, lon, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId,
      m.orientation,
      m.camera,
      m.lens,
      m.focal,
      m.iso,
      m.aperture,
      m.shutter,
      m.lat,
      m.lon,
      m.duration ?? null
    )
  })
}

/** All video assets (flag 8), for re-queueing when video indexing is toggled on. */
export function videoAssetIds(): number[] {
  return getDb().prepare(`SELECT id FROM assets WHERE (flags & 8) != 0`).pluck().all() as number[]
}

export function writeThumbState(
  assetId: number,
  state: 1 | -1,
  width?: number,
  height?: number
): void {
  if (width && height) {
    getDb()
      .prepare(
        `UPDATE assets SET thumb_state = ?, width = CASE WHEN width = 0 THEN ? ELSE width END, height = CASE WHEN height = 0 THEN ? ELSE height END WHERE id = ?`
      )
      .run(state, width, height, assetId)
  } else {
    getDb().prepare(`UPDATE assets SET thumb_state = ? WHERE id = ?`).run(state, assetId)
  }
}

export function writeVisual(assetId: number, phash: bigint, dominant: DominantColor[]): void {
  tx((d) => {
    let l = 0
    let a = 0
    let b = 0
    const rows = dominant.map((c) => ({ ...rgbToLab(c.r, c.g, c.b), weight: c.weight }))
    for (const r of rows) {
      l += r.l * r.weight
      a += r.a * r.weight
      b += r.b * r.weight
    }
    d.prepare(
      `INSERT OR REPLACE INTO asset_visual(asset_id, phash, dominant, lab_l, lab_a, lab_b) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(assetId, phash, JSON.stringify(dominant), l, a, b)
    d.prepare(`DELETE FROM asset_colors WHERE asset_id = ?`).run(assetId)
    const ins = d.prepare(
      `INSERT INTO asset_colors(asset_id, l, a, b, weight) VALUES (?, ?, ?, ?, ?)`
    )
    for (const r of rows) ins.run(assetId, r.l, r.a, r.b, r.weight)
  })
}

export function writeEmbedding(assetId: number, embedding: Float32Array): void {
  tx((d) => {
    // sqlite-vec requires INTEGER keys; better-sqlite3 binds JS numbers as REAL, so use BigInt. Vectors bind as BLOB.
    d.prepare(`DELETE FROM vec_clip WHERE asset_id = ?`).run(BigInt(assetId))
    d.prepare(`INSERT INTO vec_clip(asset_id, embedding) VALUES (?, ?)`).run(
      BigInt(assetId),
      Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
    )
  })
}

export function hasEmbedding(assetId: number): boolean {
  return !!getDb().prepare(`SELECT 1 FROM vec_clip WHERE asset_id = ?`).get(BigInt(assetId))
}

export function getEmbedding(assetId: number): Float32Array | null {
  const r = getDb()
    .prepare(`SELECT embedding FROM vec_clip WHERE asset_id = ?`)
    .pluck()
    .get(BigInt(assetId)) as Buffer | undefined
  if (!r) return null
  const out = new Float32Array(r.byteLength / 4)
  Buffer.from(out.buffer).set(r)
  return out
}

// ---------- queries ----------

interface Built {
  joins: string
  where: string[]
  params: unknown[]
  order: string
}

function build(filter: LibraryFilter): Built {
  const where: string[] = []
  const params: unknown[] = []
  let joins = ''
  let order = ''
  if (!filter.includeOffline) where.push(`(a.flags & ${AssetFlag.Offline | AssetFlag.Missing}) = 0`)
  if (filter.rootId) {
    where.push('a.root_id = ?')
    params.push(filter.rootId)
  }
  if (filter.dir) {
    where.push(`(a.dir = ? OR a.dir LIKE ?)`)
    params.push(filter.dir, filter.dir.replace(/[%_]/g, '\\$&') + '/%')
  }
  if (filter.labels?.length) {
    where.push(`a.label IN (${filter.labels.map(() => '?').join(',')})`)
    params.push(...filter.labels)
  }
  if (filter.keywords?.length) {
    for (const k of filter.keywords) {
      where.push(
        `EXISTS (SELECT 1 FROM asset_keywords ak JOIN keywords k ON k.id = ak.keyword_id WHERE ak.asset_id = a.id AND k.name = ? COLLATE NOCASE)`
      )
      params.push(k)
    }
  }
  if (filter.collectionId) {
    joins += ` JOIN collection_assets ca ON ca.asset_id = a.id AND ca.collection_id = ${Number(filter.collectionId)}`
  }
  if (filter.color) {
    const [r, g, b] = hexToRgb(filter.color)
    const lab = rgbToLab(r, g, b)
    // Per asset: closest dominant color (ΔE² in Lab). Keep assets where some color is within ΔE≈40,
    // rank by distance discounted by that color's share of the image.
    joins += ` JOIN (
      SELECT asset_id,
             MIN((l-?)*(l-?) + (a-?)*(a-?) + (b-?)*(b-?)) AS cmin,
             MIN(((l-?)*(l-?) + (a-?)*(a-?) + (b-?)*(b-?)) / (0.15 + weight)) AS cscore
      FROM asset_colors GROUP BY asset_id) c ON c.asset_id = a.id`
    params.unshift(
      lab.l,
      lab.l,
      lab.a,
      lab.a,
      lab.b,
      lab.b,
      lab.l,
      lab.l,
      lab.a,
      lab.a,
      lab.b,
      lab.b
    )
    where.push('c.cmin < 1600')
    order = 'c.cscore ASC'
  }
  if (!order) {
    const dir = filter.sortDir === 'asc' ? 'ASC' : 'DESC'
    switch (filter.sort ?? 'takenAt') {
      case 'name':
        order = `a.name ${dir}, a.id ${dir}`
        break
      case 'mtime':
        order = `a.mtime ${dir}, a.id ${dir}`
        break
      case 'size':
        order = `a.size ${dir}, a.id ${dir}`
        break
      case 'random':
        order = `((a.id * 2654435761) % 4294967296)`
        break
      default:
        order = `COALESCE(a.taken_at, a.mtime) ${dir}, a.id ${dir}`
    }
  }
  return { joins, where, params, order }
}

/** Ordered id list for a filter. Text/similar/duplicates are resolved here (they produce their own ranking). */
export function resolveIds(filter: LibraryFilter, textEmbedding?: Float32Array | null): number[] {
  const d = getDb()
  const b = build(filter)
  const whereSql = b.where.length ? `WHERE ${b.where.join(' AND ')}` : ''
  const baseSql = `SELECT a.id FROM assets a ${b.joins} ${whereSql}`

  // ranked sources (similarTo / text) restrict AND order
  let ranked: number[] | null = null
  if (filter.similarTo) {
    const emb = getEmbedding(filter.similarTo)
    if (emb) ranked = knn(emb, 200)
    else {
      // fallback: phash neighbours
      const ph = d
        .prepare('SELECT phash FROM asset_visual WHERE asset_id = ?')
        .safeIntegers()
        .pluck()
        .get(filter.similarTo) as bigint | undefined
      ranked = ph != null ? phashNeighbours(ph, 12) : []
      if (!ranked.includes(filter.similarTo)) ranked.unshift(filter.similarTo)
    }
  } else if (filter.text?.trim()) {
    const q = filter.text.trim()
    const ftsIds = d
      .prepare(`SELECT asset_id FROM fts WHERE fts MATCH ? ORDER BY rank`)
      .pluck()
      .all(ftsQuery(q)) as number[]
    const clipIds = textEmbedding ? knn(textEmbedding, 300) : []
    const seen = new Set<number>()
    ranked = []
    for (const id of [...ftsIds, ...clipIds]) {
      if (seen.has(id)) continue
      seen.add(id)
      ranked.push(id)
    }
  }

  if (ranked) {
    if (!ranked.length) return []
    const allowed = new Set(
      d
        .prepare(
          `${baseSql} ${whereSql ? 'AND' : 'WHERE'} a.id IN (${ranked.map(() => '?').join(',')})`
        )
        .pluck()
        .all(...b.params, ...ranked) as number[]
    )
    let ids = ranked.filter((id) => allowed.has(id))
    if (filter.duplicatesOnly) ids = dupFilter(ids)
    return ids
  }
  let ids = d
    .prepare(`${baseSql} ORDER BY ${b.order}`)
    .pluck()
    .all(...b.params) as number[]
  if (filter.duplicatesOnly) ids = dupFilter(ids)
  return ids
}

function dupFilter(ids: number[]): number[] {
  const clusters = duplicatesFor(ids)
  const order = new Map<number, number>()
  clusters.forEach((c, ci) => c.ids.forEach((id) => order.set(id, ci)))
  return ids.filter((id) => order.has(id)).sort((x, y) => order.get(x)! - order.get(y)! || x - y)
}

let fullHashReady = false
/** `files.full_hash`/`quick_hash` arrived after v1; add them lazily so existing libraries keep working. */
function ensureFullHash(): void {
  if (fullHashReady) return
  const d = getDb()
  for (const col of ['full_hash', 'quick_hash']) {
    try {
      d.exec(`ALTER TABLE files ADD COLUMN ${col} TEXT`)
    } catch {
      // column already exists
    }
  }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_files_size_hash ON files(size, full_hash)`)
  fullHashReady = true
}

// Primary files of the selected assets. `sel` is a json array of asset ids.
const SEL_PRIMARY = `WITH sel(id) AS (SELECT value FROM json_each(?))
  SELECT a.id AS id, f.id AS fid, f.base, f.size, f.quick_hash, f.full_hash, f.status, f.path
  FROM sel JOIN assets a ON a.id = sel.id JOIN files f ON f.id = a.primary_file_id`

/**
 * Duplicate clusters among `ids`, using only what is already known (no file I/O):
 * same base name in different folders, then byte-identical files that have a cached `full_hash`.
 * Overlapping groups are merged; name clusters come first.
 */
export function duplicatesFor(ids: number[]): DuplicateCluster[] {
  if (!ids.length) return []
  ensureFullHash()
  const d = getDb()
  const json = JSON.stringify(ids)
  const parse = (rows: string[]): number[][] => rows.map((r) => JSON.parse(r) as number[])
  const nameGroups = parse(
    d
      .prepare(
        `SELECT json_group_array(id) FROM (${SEL_PRIMARY}) GROUP BY base HAVING COUNT(*) > 1 ORDER BY base`
      )
      .pluck()
      .all(json) as string[]
  )
  const byteGroups = parse(
    d
      .prepare(
        `SELECT json_group_array(id) FROM (${SEL_PRIMARY}) WHERE full_hash IS NOT NULL
         GROUP BY size, full_hash HAVING COUNT(*) > 1 ORDER BY MIN(base)`
      )
      .pluck()
      .all(json) as string[]
  )
  return mergeDuplicateGroups(nameGroups, byteGroups)
}

/** Union overlapping groups. A merged cluster is 'name' if any name group contributed to it. */
export function mergeDuplicateGroups(
  nameGroups: number[][],
  byteGroups: number[][]
): DuplicateCluster[] {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const all = [...nameGroups, ...byteGroups]
  for (const g of all) for (const id of g) if (!parent.has(id)) parent.set(id, id)
  for (const g of all) for (const id of g.slice(1)) parent.set(find(id), find(g[0]))
  const byRoot = new Map<number, DuplicateCluster>()
  const out: DuplicateCluster[] = []
  // iteration order (name groups first) fixes cluster order
  all.forEach((g, gi) => {
    const root = find(g[0])
    let c = byRoot.get(root)
    if (!c) {
      c = { ids: [], reason: gi < nameGroups.length ? 'name' : 'bytes' }
      byRoot.set(root, c)
      out.push(c)
    }
    for (const id of g) if (!c.ids.includes(id)) c.ids.push(id)
  })
  for (const c of out) c.ids.sort((a, b) => a - b)
  return out
}

/**
 * Files that still need hashing before byte duplicates among `ids` are known.
 * Stage 'quick': same size as another file, no quick (head+tail) hash yet.
 * Stage 'full': same size AND quick hash as another file, no full hash yet.
 * The quick stage keeps a big library of same-sized RAWs from being read end to end.
 */
export function hashCandidates(
  ids: number[],
  stage: 'quick' | 'full'
): { fileId: number; path: string }[] {
  if (!ids.length) return []
  ensureFullHash()
  const sql =
    stage === 'quick'
      ? `WITH p AS (${SEL_PRIMARY}),
           dup AS (SELECT size FROM p GROUP BY size HAVING COUNT(*) > 1)
         SELECT DISTINCT fid AS fileId, path FROM p
         WHERE quick_hash IS NULL AND full_hash IS NULL AND status = 'ok'
           AND size IN (SELECT size FROM dup)
         ORDER BY size, fid`
      : `WITH p AS (${SEL_PRIMARY}),
           dup AS (SELECT size, quick_hash FROM p WHERE quick_hash IS NOT NULL
                   GROUP BY size, quick_hash HAVING COUNT(*) > 1)
         SELECT DISTINCT fid AS fileId, path FROM p
         WHERE full_hash IS NULL AND status = 'ok'
           AND (size, quick_hash) IN (SELECT size, quick_hash FROM dup)
         ORDER BY size, fid`
  return getDb().prepare(sql).all(JSON.stringify(ids)) as { fileId: number; path: string }[]
}

export function setFileHash(fileId: number, stage: 'quick' | 'full', hash: string): void {
  getDb()
    .prepare(`UPDATE files SET ${stage === 'quick' ? 'quick_hash' : 'full_hash'} = ? WHERE id = ?`)
    .run(hash, fileId)
}

function phashNeighbours(ph: bigint, maxDist: number): number[] {
  const d = getDb()
  const rows = d
    .prepare(`SELECT asset_id AS id, phash FROM asset_visual WHERE phash IS NOT NULL`)
    .safeIntegers()
    .all() as { id: bigint; phash: bigint }[]
  const out: { id: number; dist: number }[] = []
  for (const r of rows) {
    const dist = hamming(ph, BigInt(r.phash))
    if (dist <= maxDist) out.push({ id: Number(r.id), dist })
  }
  return out.sort((a, b) => a.dist - b.dist).map((o) => o.id)
}

function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b)
  let c = 0
  while (x) {
    x &= x - 1n
    c++
  }
  return c
}

export function knn(embedding: Float32Array, k: number): number[] {
  return getDb()
    .prepare(`SELECT asset_id FROM vec_clip WHERE embedding MATCH ? AND k = ? ORDER BY distance`)
    .pluck()
    .all(
      Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
      BigInt(k)
    ) as number[]
}

function ftsQuery(q: string): string {
  // each token as prefix match, AND-ed; quotes escaped
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(' AND ')
}

export function tilesByIds(ids: number[]): AssetTile[] {
  if (!ids.length) return []
  const d = getDb()
  ensureDurationColumn(d)
  const rows = d
    .prepare(`SELECT ${TILE_COLS} FROM assets a WHERE a.id IN (SELECT value FROM json_each(?))`)
    .all(JSON.stringify(ids)) as AssetTile[]
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((x): x is AssetTile => !!x)
}

export function detail(id: number): AssetDetail | null {
  const d = getDb()
  ensureDurationColumn(d)
  const a = d
    .prepare(`SELECT ${TILE_COLS}, a.name, a.dir, a.root_id AS rootId FROM assets a WHERE a.id = ?`)
    .get(id) as (AssetTile & { name: string; dir: string; rootId: number }) | undefined
  if (!a) return null
  const files = d
    .prepare(
      `SELECT id, path, ext, size, mtime, status, is_raw AS isRaw FROM files WHERE asset_id = ? ORDER BY is_raw DESC, id`
    )
    .all(id) as (Omit<AssetFile, 'isRaw'> & { isRaw: number })[]
  const m = d.prepare(`SELECT * FROM asset_meta WHERE asset_id = ?`).get(id) as
    Record<string, number | string | null> | undefined
  const kws = d
    .prepare(
      `SELECT k.name FROM asset_keywords ak JOIN keywords k ON k.id = ak.keyword_id WHERE ak.asset_id = ? ORDER BY k.name`
    )
    .pluck()
    .all(id) as string[]
  const dom = d.prepare(`SELECT dominant FROM asset_visual WHERE asset_id = ?`).pluck().get(id) as
    string | undefined
  return {
    ...a,
    files: files.map((f) => ({ ...f, isRaw: !!f.isRaw })),
    meta: m
      ? {
          width: a.w,
          height: a.h,
          orientation: Number(m.orientation),
          takenAt: a.takenAt,
          camera: m.camera as string | null,
          lens: m.lens as string | null,
          focal: m.focal as number | null,
          iso: m.iso as number | null,
          aperture: m.aperture as number | null,
          shutter: m.shutter as number | null,
          lat: m.lat as number | null,
          lon: m.lon as number | null,
          duration: (m.duration ?? null) as number | null
        }
      : null,
    keywords: kws,
    dominant: dom ? (JSON.parse(dom) as DominantColor[]) : [],
    hasEmbedding: hasEmbedding(id)
  }
}

export function folderTree(rootId: number): { path: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT dir AS path, COUNT(*) AS count FROM assets WHERE root_id = ? GROUP BY dir ORDER BY dir`
    )
    .all(rootId) as { path: string; count: number }[]
}

export function paletteFor(ids: number[]): DominantColor[] {
  if (!ids.length) return []
  const rows = getDb()
    .prepare(
      `SELECT dominant FROM asset_visual WHERE dominant IS NOT NULL AND asset_id IN (SELECT value FROM json_each(?))`
    )
    .pluck()
    .all(JSON.stringify(ids.slice(0, 3000))) as string[]
  const rgb: number[] = []
  for (const s of rows)
    for (const c of JSON.parse(s) as DominantColor[]) if (c.weight > 0.1) rgb.push(c.r, c.g, c.b)
  return rgb.length ? dominantColors(Uint8Array.from(rgb), 12, 6) : []
}
