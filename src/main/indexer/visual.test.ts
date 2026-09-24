import { describe, expect, it } from 'vitest'
import { dominantColors, duplicateClusters, hamming64, hexToRgb, phash32, rgbToLab } from './visual'

describe('rgbToLab', () => {
  it('maps white/black to L extremes', () => {
    expect(rgbToLab(255, 255, 255).l).toBeCloseTo(100, 0)
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 0)
  })
  it('red has positive a', () => {
    expect(rgbToLab(255, 0, 0).a).toBeGreaterThan(50)
  })
})

describe('hexToRgb', () => {
  it('parses long and short forms', () => {
    expect(hexToRgb('#ff8800')).toEqual([255, 136, 0])
    expect(hexToRgb('f80')).toEqual([255, 136, 0])
  })
})

describe('dominantColors', () => {
  it('finds the two colors of a half/half image', () => {
    const px: number[] = []
    for (let i = 0; i < 1000; i++) px.push(255, 0, 0)
    for (let i = 0; i < 1000; i++) px.push(0, 0, 255)
    const out = dominantColors(Uint8Array.from(px), 4)
    const big = out.filter((c) => c.weight > 0.4)
    expect(big.length).toBe(2)
    expect(big.some((c) => c.r > 200 && c.b < 50)).toBe(true)
    expect(big.some((c) => c.b > 200 && c.r < 50)).toBe(true)
  })
})

describe('phash32', () => {
  // 2D synthetic scene: diagonal gradient + bright blob. A pure 1D gradient is degenerate
  // (most DCT coefficients are exactly 0 = median) so any noise flips them.
  const gradient = (): Uint8Array => {
    const g = new Uint8Array(32 * 32)
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const blob = Math.exp(-((x - 10) ** 2 + (y - 20) ** 2) / 30) * 120
        g[y * 32 + x] = Math.min(255, Math.round(x * 4 + y * 3 + blob))
      }
    return g
  }
  it('is stable and near-identical for slightly noisy copies', () => {
    const a = phash32(gradient())
    const noisy = gradient()
    for (let i = 0; i < noisy.length; i += 7) noisy[i] = Math.min(255, noisy[i] + 3)
    const b = phash32(noisy)
    expect(hamming64(a, b)).toBeLessThanOrEqual(4)
  })
  it('differs for a transposed image', () => {
    const g = gradient()
    const t = new Uint8Array(32 * 32)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) t[y * 32 + x] = g[x * 32 + y]
    expect(hamming64(phash32(gradient()), phash32(t))).toBeGreaterThan(10)
  })
})

describe('duplicateClusters', () => {
  it('groups near hashes, leaves singletons out', () => {
    const base = 0x0123456789abcdefn
    const items = [
      { id: 1, phash: BigInt.asIntN(64, base) },
      { id: 2, phash: BigInt.asIntN(64, base ^ 0b101n) }, // dist 2
      { id: 3, phash: BigInt.asIntN(64, ~base) }, // far
      { id: 4, phash: BigInt.asIntN(64, base ^ (1n << 40n)) } // dist 1
    ]
    expect(duplicateClusters(items, 6)).toEqual([[1, 2, 4]])
  })
})
