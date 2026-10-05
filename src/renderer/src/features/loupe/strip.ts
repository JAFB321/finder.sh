// Pure geometry for the virtualized filmstrip.

export const STRIP_ITEM_H = 68
export const STRIP_GAP = 6

/** Item width (without gap) for an aspect ratio; unknown ratios fall back to 3:2. */
export function itemWidth(ar: number | undefined): number {
  const r = ar && Number.isFinite(ar) && ar > 0 ? ar : 1.5
  return Math.round(STRIP_ITEM_H * r)
}

/** offsets[i] = left edge of item i; offsets[n] = total width (including trailing gap). */
export function prefixOffsets(widths: ArrayLike<number>): Float64Array {
  const out = new Float64Array(widths.length + 1)
  for (let i = 0; i < widths.length; i++) out[i + 1] = out[i] + widths[i] + STRIP_GAP
  return out
}

/** Index of the last item whose left edge is <= x (clamped to [0, n-1]). */
function lowerIndex(offsets: Float64Array, x: number): number {
  const n = offsets.length - 1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Half-open range [start, end) of items intersecting [from, to]. */
export function visibleRange(offsets: Float64Array, from: number, to: number): [number, number] {
  const n = offsets.length - 1
  if (n <= 0) return [0, 0]
  const start = lowerIndex(offsets, Math.max(0, from))
  const end = Math.min(n, lowerIndex(offsets, Math.max(0, to)) + 1)
  return [start, end]
}

/** scrollLeft that centres item i in a viewport of width `vw`. `pad` = leading padding. */
export function centreScroll(offsets: Float64Array, i: number, vw: number, pad: number): number {
  const n = offsets.length - 1
  if (n <= 0) return 0
  const k = Math.min(n - 1, Math.max(0, i))
  const w = offsets[k + 1] - offsets[k] - STRIP_GAP
  const total = offsets[n] - STRIP_GAP + pad * 2
  const target = pad + offsets[k] + w / 2 - vw / 2
  return Math.max(0, Math.min(Math.max(0, total - vw), target))
}
