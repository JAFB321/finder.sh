// Pure date grouping for the timeline layout. Input order is respected: sections are runs of
// consecutive ids that fall in the same period, so the caller must pass ids already in
// timeline order (see `timelineOrder`).
import type { AssetTile } from '@shared/types'
import type { LayoutSection } from '../library/layouts'

export type TimeGroup = 'day' | 'month' | 'year'
export type TimeGroupSetting = TimeGroup | 'auto'

export interface TimeSection extends LayoutSection {
  /** local start of the period in ms; -1 = unknown date */
  key: number
  count: number
}

export const UNKNOWN = -1

/** Small thumbs read as an overview → coarser groups. */
export function autoGroup(size: number): TimeGroup {
  return size < 180 ? 'month' : 'day'
}

export function resolveGroup(setting: TimeGroupSetting, size: number): TimeGroup {
  return setting === 'auto' ? autoGroup(size) : setting
}

/** [start, end) of the local period containing t. */
function period(t: number, g: TimeGroup): [number, number] {
  const d = new Date(t)
  const y = d.getFullYear()
  if (g === 'year') return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()]
  const m = d.getMonth()
  if (g === 'month') return [new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()]
  const day = d.getDate()
  return [new Date(y, m, day).getTime(), new Date(y, m, day + 1).getTime()]
}

const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtDayShort = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const fmtMonthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })
const fmtMonthOnly = new Intl.DateTimeFormat('en-GB', { month: 'short' })

export function sectionLabel(key: number, g: TimeGroup): string {
  if (key === UNKNOWN) return 'Unknown date'
  const d = new Date(key)
  if (g === 'year') return String(d.getFullYear())
  if (g === 'month') return fmtMonth.format(d)
  return `${fmtWeekday.format(d)}, ${fmtDay.format(d)}`
}

/** Compact label for the scrubber (hover pill / marker). */
export function shortLabel(key: number, g: TimeGroup): string {
  if (key === UNKNOWN) return 'Unknown'
  const d = new Date(key)
  if (g === 'year') return String(d.getFullYear())
  if (g === 'month') return fmtMonthShort.format(d)
  return fmtDayShort.format(d)
}

export function monthAbbr(key: number): string {
  return fmtMonthOnly.format(new Date(key))
}

export function countLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'photo' : 'photos'}`
}

/**
 * Group consecutive ids by period. O(n) with one Date allocation per period change, so it
 * stays cheap at 36k items. Tiles not loaded yet join the running section.
 */
export function groupByTime(
  ids: number[],
  tiles: Map<number, AssetTile>,
  g: TimeGroup
): TimeSection[] {
  const out: TimeSection[] = []
  let cur: TimeSection | null = null
  let lo = 0
  let hi = 0
  for (let i = 0; i < ids.length; i++) {
    const tile = tiles.get(ids[i])
    let key: number
    if (!tile) key = cur ? cur.key : UNKNOWN
    else if (tile.takenAt == null) key = UNKNOWN
    else if (cur && cur.key !== UNKNOWN && tile.takenAt >= lo && tile.takenAt < hi) key = cur.key
    else {
      ;[lo, hi] = period(tile.takenAt, g)
      key = lo
    }
    if (!cur || cur.key !== key) {
      cur = { start: i, key, count: 0, label: sectionLabel(key, g) }
      out.push(cur)
    }
    cur.count++
  }
  return out
}

/**
 * Timeline order: takenAt desc, undated last, otherwise stable w.r.t. the server order.
 * Tiles that have not arrived yet sort just before the undated ones.
 */
export function timelineOrder(ids: number[], tiles: Map<number, AssetTile>): number[] {
  const n = ids.length
  const keys = new Float64Array(n)
  const idx = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const t = tiles.get(ids[i])
    keys[i] = !t ? -Number.MAX_VALUE : t.takenAt == null ? -Infinity : t.takenAt
    idx[i] = i
  }
  idx.sort((a, b) => keys[b] - keys[a] || a - b)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = ids[idx[i]]
  return out
}
