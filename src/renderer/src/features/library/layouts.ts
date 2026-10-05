// Pure layout algorithms. Input: ordered items with aspect ratios. Output: absolute boxes.
import type { LayoutKind } from '@shared/types'

export interface LayoutItem {
  id: number
  /** width / height; 0 = unknown */
  ar: number
}

export interface Box {
  id: number
  x: number
  y: number
  w: number
  h: number
  /** index in the input array */
  i: number
}

export interface LayoutResult {
  boxes: Box[]
  height: number
  /** for row-based layouts, index of first box of each row (used for keyboard nav) */
  rows?: number[]
  /** sectioned layouts only: one header per section, in order */
  headers?: SectionHeader[]
}

/** A run of consecutive items starting at `start` (sections must be sorted by start). */
export interface LayoutSection {
  start: number
  label: string
}

export interface SectionHeader {
  /** top of the header row; the section's first box starts at y + headerHeight */
  y: number
  label: string
  count: number
  /** index of the section's first item */
  firstIndex: number
}

export interface LayoutOptions {
  kind: LayoutKind
  width: number
  /** target row height (justified) / cell size (grid) / column width (masonry) */
  size: number
  gap: number
  /** when set, items are laid out per section (justified rows) below a header row */
  sections?: LayoutSection[]
  headerHeight?: number
  sectionGap?: number
}

const DEFAULT_AR = 3 / 2
const ar = (it: LayoutItem): number => (it.ar > 0 ? Math.min(Math.max(it.ar, 0.2), 5) : DEFAULT_AR)

export function computeLayout(items: LayoutItem[], o: LayoutOptions): LayoutResult {
  if (!items.length || o.width <= 0) return { boxes: [], height: 0, rows: [], headers: [] }
  if (o.sections?.length) return sectioned(items, o, o.sections)
  switch (o.kind) {
    case 'grid':
      return grid(items, o)
    case 'masonry':
      return masonry(items, o)
    default:
      return justified(items, o)
  }
}

/** Flickr-style justified rows: fill each row to full width, scale height to fit. */
function justified(items: LayoutItem[], o: LayoutOptions): LayoutResult {
  const boxes: Box[] = []
  const rows: number[] = []
  const { width, gap } = o
  const target = o.size
  let y = 0
  let rowStart = 0
  let arSum = 0
  const flush = (end: number, last: boolean): void => {
    const n = end - rowStart
    if (n <= 0) return
    const avail = width - gap * (n - 1)
    let h = avail / arSum
    if (last && h > target * 1.15) h = target // don't blow up a short final row
    h = Math.round(h)
    let x = 0
    rows.push(boxes.length)
    for (let i = rowStart; i < end; i++) {
      const w = Math.round(h * ar(items[i]))
      boxes.push({ id: items[i].id, x, y, w, h, i })
      x += w + gap
    }
    y += h + gap
    rowStart = end
    arSum = 0
  }
  for (let i = 0; i < items.length; i++) {
    arSum += ar(items[i])
    const n = i - rowStart + 1
    const h = (width - gap * (n - 1)) / arSum
    if (h <= target) flush(i + 1, false)
  }
  flush(items.length, true)
  return { boxes, height: Math.max(0, y - gap), rows }
}

/** Justified rows per section, each preceded by a header row. Box order == item order. */
function sectioned(items: LayoutItem[], o: LayoutOptions, sections: LayoutSection[]): LayoutResult {
  const headerH = o.headerHeight ?? 36
  const sectionGap = o.sectionGap ?? 24
  const boxes: Box[] = []
  const rows: number[] = []
  const headers: SectionHeader[] = []
  let y = 0
  for (let k = 0; k < sections.length; k++) {
    const start = sections[k].start
    const end = k + 1 < sections.length ? sections[k + 1].start : items.length
    if (end <= start) continue
    if (headers.length) y += sectionGap
    headers.push({ y, label: sections[k].label, count: end - start, firstIndex: start })
    const top = y + headerH
    const r = justified(items.slice(start, end), o)
    const offset = boxes.length
    for (const b of r.boxes)
      boxes.push({ id: b.id, x: b.x, y: b.y + top, w: b.w, h: b.h, i: b.i + start })
    for (const row of r.rows!) rows.push(row + offset)
    y = top + r.height
  }
  return { boxes, height: y, rows, headers }
}

/** Index of the last header whose y <= top (headers sorted by y); -1 if none. */
export function headerAt(headers: SectionHeader[], top: number): number {
  let lo = 0
  let hi = headers.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (headers[mid].y <= top) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Uniform square cells, image letterboxed (contain) inside by the renderer. */
function grid(items: LayoutItem[], o: LayoutOptions): LayoutResult {
  const { width, gap } = o
  const cols = Math.max(1, Math.floor((width + gap) / (o.size + gap)))
  const cell = Math.floor((width - gap * (cols - 1)) / cols)
  const boxes: Box[] = []
  const rows: number[] = []
  for (let i = 0; i < items.length; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    if (c === 0) rows.push(i)
    boxes.push({ id: items[i].id, x: c * (cell + gap), y: r * (cell + gap), w: cell, h: cell, i })
  }
  const nrows = Math.ceil(items.length / cols)
  return { boxes, height: nrows * cell + (nrows - 1) * gap, rows }
}

/** Pinterest-style columns; each item goes to the shortest column. */
function masonry(items: LayoutItem[], o: LayoutOptions): LayoutResult {
  const { width, gap } = o
  const cols = Math.max(1, Math.floor((width + gap) / (o.size + gap)))
  const colW = Math.floor((width - gap * (cols - 1)) / cols)
  const heights = new Array<number>(cols).fill(0)
  const boxes: Box[] = []
  for (let i = 0; i < items.length; i++) {
    let c = 0
    for (let k = 1; k < cols; k++) if (heights[k] < heights[c] - 1) c = k
    const h = Math.round(colW / ar(items[i]))
    boxes.push({ id: items[i].id, x: c * (colW + gap), y: heights[c], w: colW, h, i })
    heights[c] += h + gap
  }
  return { boxes, height: Math.max(0, Math.max(...heights) - gap) }
}

/** Spatial index for fast visible-range queries on any layout. */
export class BoxIndex {
  private buckets: number[][] = []
  constructor(
    private boxes: Box[],
    private bucket = 512
  ) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const from = Math.floor(b.y / bucket)
      const to = Math.floor((b.y + b.h) / bucket)
      for (let k = from; k <= to; k++) (this.buckets[k] ??= []).push(i)
    }
  }
  visible(top: number, bottom: number): Box[] {
    const from = Math.max(0, Math.floor(top / this.bucket))
    const to = Math.floor(bottom / this.bucket)
    const seen = new Set<number>()
    const out: Box[] = []
    for (let k = from; k <= to; k++) {
      const arr = this.buckets[k]
      if (!arr) continue
      for (const i of arr) {
        if (seen.has(i)) continue
        seen.add(i)
        const b = this.boxes[i]
        if (b.y + b.h >= top && b.y <= bottom) out.push(b)
      }
    }
    return out
  }
}

/** Keyboard navigation: nearest box in the row above/below by horizontal centre. */
export function navigate(
  boxes: Box[],
  from: number,
  dir: 'up' | 'down' | 'left' | 'right'
): number {
  if (!boxes.length) return -1
  if (from < 0) return 0
  if (dir === 'left') return Math.max(0, from - 1)
  if (dir === 'right') return Math.min(boxes.length - 1, from + 1)
  const cur = boxes[from]
  const cx = cur.x + cur.w / 2
  const cy = cur.y + cur.h / 2
  let best = -1
  let bestScore = Infinity
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    const by = b.y + b.h / 2
    if (dir === 'up' ? by >= cy - 1 : by <= cy + 1) continue
    const dy = Math.abs(by - cy)
    const dx = Math.abs(b.x + b.w / 2 - cx)
    const score = dy * 4 + dx
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return best === -1 ? from : best
}
