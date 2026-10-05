import type { IndexProgress, JobKind } from '@shared/types'
import { getDb, now } from './index'

export const JOB_KINDS: JobKind[] = ['meta', 'thumb', 'visual', 'embed']

export interface JobRow {
  asset_id: number
  kind: JobKind
}

export function enqueue(assetIds: number[], kinds: JobKind[] = JOB_KINDS, priority = 0): void {
  const d = getDb()
  const stmt = d.prepare(
    `INSERT INTO jobs(asset_id, kind, state, priority, updated_at) VALUES (?, ?, 'pending', ?, ?)
     ON CONFLICT(asset_id, kind) DO UPDATE SET state = 'pending', priority = MAX(priority, excluded.priority), attempts = 0, error = NULL, updated_at = excluded.updated_at
     WHERE state = 'failed' OR state = 'done'`
  )
  const t = now()
  d.transaction(() => {
    for (const id of assetIds) for (const k of kinds) stmt.run(id, k, priority, t)
  })()
}

/** Bump priority for assets the user is looking at. */
export function bumpPriority(assetIds: number[], priority: number): void {
  if (!assetIds.length) return
  const d = getDb()
  const stmt = d.prepare(
    `UPDATE jobs SET priority = ? WHERE asset_id = ? AND state = 'pending' AND priority < ?`
  )
  d.transaction(() => {
    for (const id of assetIds) stmt.run(priority, id, priority)
  })()
}

/**
 * Claim up to `limit` pending jobs of `kind`, honouring dependency order:
 * thumb needs meta done, visual needs thumb done, embed needs thumb done.
 */
export function claim(kind: JobKind, limit: number): number[] {
  const d = getDb()
  const dep: Record<JobKind, JobKind | null> = {
    meta: null,
    thumb: 'meta',
    visual: 'thumb',
    embed: 'thumb'
  }
  const depKind = dep[kind]
  const depClause = depKind
    ? `AND EXISTS (SELECT 1 FROM jobs j2 WHERE j2.asset_id = j.asset_id AND j2.kind = '${depKind}' AND j2.state = 'done')`
    : ''
  const rows = d
    .prepare(
      `SELECT j.asset_id FROM jobs j
       JOIN assets a ON a.id = j.asset_id
       WHERE j.state = 'pending' AND j.kind = ? AND (a.flags & 6) = 0 AND j.attempts < 3 ${depClause}
       ORDER BY j.priority DESC, j.asset_id
       LIMIT ?`
    )
    .pluck()
    .all(kind, limit) as number[]
  if (rows.length) {
    const t = now()
    const stmt = d.prepare(
      `UPDATE jobs SET state = 'running', attempts = attempts + 1, updated_at = ? WHERE asset_id = ? AND kind = ?`
    )
    d.transaction(() => {
      for (const id of rows) stmt.run(t, id, kind)
    })()
  }
  return rows
}

export function complete(assetId: number, kind: JobKind, error?: string): void {
  getDb()
    .prepare(`UPDATE jobs SET state = ?, error = ?, updated_at = ? WHERE asset_id = ? AND kind = ?`)
    .run(error ? 'failed' : 'done', error ?? null, now(), assetId, kind)
}

/** On startup, anything left 'running' from a crashed session goes back to pending. */
export function resetRunning(): void {
  const d = getDb()
  d.prepare(`UPDATE jobs SET state = 'pending' WHERE state = 'running'`).run()
  // give failed jobs another chance each launch (transient errors: model not yet downloaded, drive busy)
  retryFailed()
}

/** Failed jobs back to pending with a fresh attempt budget. Returns how many were reset. */
export function retryFailed(): number {
  return getDb()
    .prepare(`UPDATE jobs SET state = 'pending', attempts = 0, error = NULL WHERE state = 'failed'`)
    .run().changes
}

export function counts(): Pick<IndexProgress, 'pending' | 'done' | 'failed' | 'failures'> {
  const rows = getDb()
    .prepare(`SELECT kind, state, COUNT(*) AS n FROM jobs GROUP BY kind, state`)
    .all() as {
    kind: JobKind
    state: string
    n: number
  }[]
  const zero = (): Record<JobKind, number> => ({ meta: 0, thumb: 0, visual: 0, embed: 0 })
  const out = { pending: zero(), done: zero(), failed: zero() }
  for (const r of rows) {
    if (r.state === 'pending' || r.state === 'running') out.pending[r.kind] += r.n
    else if (r.state === 'done') out.done[r.kind] += r.n
    else if (r.state === 'failed') out.failed[r.kind] += r.n
  }
  const anyFailed = JOB_KINDS.some((k) => out.failed[k] > 0)
  if (!anyFailed) return { ...out, failures: [] }
  // Jobs downstream of a failed one can never be claimed (see claim()); they are not "pending".
  const blocked = getDb()
    .prepare(
      `SELECT j.kind, COUNT(DISTINCT j.asset_id) AS n FROM jobs u
       JOIN jobs j ON j.asset_id = u.asset_id AND j.state = 'pending'
       WHERE u.state = 'failed' AND (
         (j.kind = 'thumb' AND u.kind = 'meta') OR
         (j.kind IN ('visual', 'embed') AND u.kind IN ('meta', 'thumb')))
       GROUP BY j.kind`
    )
    .all() as { kind: JobKind; n: number }[]
  for (const b of blocked) out.pending[b.kind] = Math.max(0, out.pending[b.kind] - b.n)
  return { ...out, failures: failureBreakdown() }
}

function failureBreakdown(): IndexProgress['failures'] {
  const rows = getDb()
    .prepare(
      `SELECT kind, error, COUNT(*) AS count FROM jobs WHERE state = 'failed' GROUP BY kind, error`
    )
    .all() as { kind: JobKind; error: string | null; count: number }[]
  // messages often embed the file path; strip it so identical causes group together
  const merged = new Map<string, IndexProgress['failures'][number]>()
  for (const r of rows) {
    const error = (r.error ?? 'unknown error')
      .replace(/(['"`])\/[^'"`]*\1/g, '…')
      .replace(/(^|\s)\/\S+/g, '$1…')
      .slice(0, 160)
    const key = `${r.kind}\0${error}`
    const m = merged.get(key)
    if (m) m.count += r.count
    else merged.set(key, { kind: r.kind, error, count: r.count })
  }
  return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 5)
}
