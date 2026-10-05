import { describe, expect, it } from 'vitest'
import { STRIP_GAP, centreScroll, itemWidth, prefixOffsets, visibleRange } from './strip'
import { FIT, clampView, fitRect, needsFullTier, zoomAt } from './zoom'

describe('strip', () => {
  const widths = Array.from({ length: 10_000 }, (_, i) => itemWidth(i % 2 ? 1.5 : 0.67))
  const off = prefixOffsets(widths)

  it('falls back to 3:2 for unknown ratios', () => {
    expect(itemWidth(undefined)).toBe(102)
    expect(itemWidth(0)).toBe(102)
  })

  it('prefix sums include the gap', () => {
    expect(off[1]).toBe(widths[0] + STRIP_GAP)
    expect(off.length).toBe(10_001)
  })

  it('finds items intersecting a window, including the very end', () => {
    const [s, e] = visibleRange(off, off[5000] + 1, off[5003] - 1)
    expect(s).toBe(5000)
    expect(e).toBe(5003)
    const [s2, e2] = visibleRange(off, off[10_000] - 500, off[10_000] + 500)
    expect(e2).toBe(10_000)
    expect(s2).toBeGreaterThan(9990)
  })

  it('centres and clamps', () => {
    expect(centreScroll(off, 0, 800, 12)).toBe(0)
    const total = off[10_000] - STRIP_GAP + 24
    expect(centreScroll(off, 9999, 800, 12)).toBe(total - 800)
    const mid = centreScroll(off, 5000, 800, 12)
    expect(mid + 400).toBeCloseTo(12 + off[5000] + widths[5000] / 2)
  })
})

describe('zoom', () => {
  const rect = fitRect(1000, 600, 1.5, 0)

  it('fits by the limiting side', () => {
    expect(rect).toEqual({ x: 50, y: 0, w: 900, h: 600 })
  })

  it('keeps the point under the cursor fixed', () => {
    const v = zoomAt(FIT, 2, 300, 200)
    // image point under (300,200) at s=1 is (300,200); after zoom it maps back to the same spot
    expect(300 * v.s + v.tx).toBeCloseTo(300)
    expect(200 * v.s + v.ty).toBeCloseTo(200)
  })

  it('clamps scale and pan', () => {
    expect(clampView({ s: 0.5, tx: 10, ty: 10 }, rect, 1000, 600, 4)).toEqual(FIT)
    const v = clampView({ s: 10, tx: 5000, ty: -99999 }, rect, 1000, 600, 4)
    expect(v.s).toBe(4)
    expect(v.tx).toBe(-rect.x * 4) // left edge pinned
    expect(v.ty).toBe(600 - 600 * 4) // bottom edge pinned
  })
})

describe('needsFullTier', () => {
  // ARW: 1616 px preview in a 1200 px wide fit rect, 6000 px original
  it('stays on the preview at fit and while it still has enough pixels', () => {
    expect(needsFullTier(1, 1200, 1616, 6000)).toBe(false)
    expect(needsFullTier(1.3, 1200, 1616, 6000)).toBe(false)
  })
  it('asks for the full tier once zoomed past the preview pixels', () => {
    expect(needsFullTier(1.4, 1200, 1616, 6000)).toBe(true)
  })
  it('never for an already full-size image, or before the hi-res loaded', () => {
    expect(needsFullTier(4, 1200, 6000, 6000)).toBe(false)
    expect(needsFullTier(4, 1200, 1616, 1616)).toBe(false)
    expect(needsFullTier(4, 1200, 0, 6000)).toBe(false)
  })
  it('does not fire at fit even on a stage wider than the preview', () => {
    expect(needsFullTier(1, 2400, 1616, 6000)).toBe(false)
    // Retina: 1.2 x 1200 css px = 2880 device px > 1616 loaded px
    expect(needsFullTier(1.2, 1200, 1616, 6000, 2)).toBe(true)
    expect(needsFullTier(1.2, 1200, 1616, 6000, 1)).toBe(false)
  })
})
