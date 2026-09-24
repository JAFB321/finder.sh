import { describe, expect, it } from 'vitest'
import { BoxIndex, computeLayout, navigate } from './layouts'

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
