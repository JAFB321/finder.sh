import { describe, expect, it } from 'vitest'
import { BoxIndex, computeLayout, headerAt, navigate } from './layouts'

const items = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, ar: i % 3 === 0 ? 0.67 : 1.5 }))

describe('justified', () => {
  it('fills every non-final row to full width', () => {
    const r = computeLayout(items, { kind: 'justified', width: 1000, size: 200, gap: 8 })
    const rows = r.rows!
    for (let k = 0; k < rows.length - 1; k++) {
      const first = r.boxes[rows[k]]
      const last = r.boxes[rows[k + 1] - 1]
      expect(last.x + last.w).toBeGreaterThanOrEqual(995)
      expect(last.x + last.w).toBeLessThanOrEqual(1005)
      expect(first.h).toBe(last.h)
    }
    expect(r.height).toBeGreaterThan(0)
  })
})

describe('grid', () => {
  it('uses square cells and wraps', () => {
    const r = computeLayout(items, { kind: 'grid', width: 1000, size: 200, gap: 8 })
    expect(r.boxes[0].w).toBe(r.boxes[0].h)
    const cols = r.rows![1] // first index of row 2 == column count
    expect(cols).toBe(4)
    expect(r.boxes[cols - 1].x).toBe(r.boxes[0].x + (cols - 1) * (r.boxes[0].w + 8))
    expect(r.boxes[cols].y).toBeGreaterThan(0)
    expect(r.boxes[cols].x).toBe(0)
  })
})

describe('masonry', () => {
  it('keeps column width constant and total height ≥ tallest column', () => {
    const r = computeLayout(items, { kind: 'masonry', width: 1000, size: 240, gap: 8 })
    const w = r.boxes[0].w
    for (const b of r.boxes) expect(b.w).toBe(w)
    expect(r.height).toBe(Math.max(...r.boxes.map((b) => b.y + b.h)))
  })
})

describe('BoxIndex + navigate', () => {
  it('returns only boxes intersecting the window', () => {
    const r = computeLayout(items, { kind: 'grid', width: 1000, size: 200, gap: 8 })
    const idx = new BoxIndex(r.boxes)
    const vis = idx.visible(0, 100)
    expect(vis.every((b) => b.y <= 100)).toBe(true)
    expect(vis.length).toBe(4)
  })
  it('moves down to the box below', () => {
    const r = computeLayout(items, { kind: 'grid', width: 1000, size: 200, gap: 8 })
    expect(navigate(r.boxes, 1, 'down')).toBe(5)
    expect(navigate(r.boxes, 5, 'up')).toBe(1)
    expect(navigate(r.boxes, 0, 'left')).toBe(0)
  })
})

describe('sectioned (timeline)', () => {
  const sections = [
    { start: 0, label: 'A' },
    { start: 13, label: 'B' },
    { start: 30, label: 'C' }
  ]
  const opts = {
    kind: 'timeline' as const,
    width: 1000,
    size: 200,
    gap: 8,
    sections,
    headerHeight: 36,
    sectionGap: 24
  }
  const r = computeLayout(items, opts)
  const headers = r.headers!

  it('emits one header per section, before its rows', () => {
    expect(headers.map((h) => [h.label, h.count, h.firstIndex])).toEqual([
      ['A', 13, 0],
      ['B', 17, 13],
      ['C', 10, 30]
    ])
    expect(headers[0].y).toBe(0)
    for (let k = 0; k < headers.length; k++) {
      const first = r.boxes[headers[k].firstIndex]
      expect(first.y).toBe(headers[k].y + 36)
      expect(first.x).toBe(0)
    }
    expect(r.boxes.map((b) => b.i)).toEqual(items.map((_, i) => i))
  })

  it('never overlaps a header with a box, and leaves the section gap', () => {
    for (const h of headers)
      for (const b of r.boxes) expect(b.y + b.h <= h.y || b.y >= h.y + 36).toBe(true)
    for (let k = 1; k < headers.length; k++) {
      const prevLast = r.boxes[headers[k].firstIndex - 1]
      expect(headers[k].y).toBe(prevLast.y + prevLast.h + 24)
    }
    const last = r.boxes[r.boxes.length - 1]
    expect(r.height).toBe(last.y + last.h)
  })

  it('starts a new row at every section boundary', () => {
    for (const h of headers) expect(r.rows).toContain(h.firstIndex)
  })

  it('navigates across a section boundary', () => {
    const lastOfA = headers[1].firstIndex - 1
    const down = navigate(r.boxes, lastOfA, 'down')
    expect(down).toBeGreaterThanOrEqual(headers[1].firstIndex)
    expect(r.boxes[down].y).toBe(headers[1].y + 36)
    const up = navigate(r.boxes, headers[1].firstIndex, 'up')
    expect(up).toBeLessThan(headers[1].firstIndex)
    expect(navigate(r.boxes, lastOfA, 'right')).toBe(headers[1].firstIndex)
  })

  it('finds the header containing a scroll offset', () => {
    expect(headerAt(headers, -5)).toBe(-1)
    expect(headerAt(headers, 0)).toBe(0)
    expect(headerAt(headers, headers[1].y - 1)).toBe(0)
    expect(headerAt(headers, headers[2].y + 5)).toBe(2)
  })
})
