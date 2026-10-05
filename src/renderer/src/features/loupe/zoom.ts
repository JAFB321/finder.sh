// Pure zoom/pan math for the loupe stage. Coordinates are in stage (container) pixels.
// The view transform is `translate(tx, ty) scale(s)` with transform-origin 0 0, where
// s = 1 means "fit". `rect` is the fitted image rectangle at s = 1.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface View {
  s: number
  tx: number
  ty: number
}

export const FIT: View = { s: 1, tx: 0, ty: 0 }

/** Largest rect with aspect `ar` that fits in (cw, ch) minus `pad`, centred. */
export function fitRect(cw: number, ch: number, ar: number, pad: number): Rect {
  const aw = Math.max(1, cw - pad * 2)
  const ah = Math.max(1, ch - pad * 2)
  let w = aw
  let h = w / ar
  if (h > ah) {
    h = ah
    w = h * ar
  }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

/** Max zoom relative to fit: at least 4×, and always enough to reach 100 % pixels. */
export function maxScale(oneToOne: number): number {
  return Math.max(4, oneToOne)
}

function clampAxis(t: number, s: number, start: number, size: number, viewport: number): number {
  const scaled = size * s
  if (scaled <= viewport) return (viewport - scaled) / 2 - start * s
  const min = viewport - (start + size) * s
  const max = -start * s
  return Math.min(max, Math.max(min, t))
}

/** Keeps the image covering the viewport when larger than it, centred when smaller. */
export function clampView(v: View, rect: Rect, cw: number, ch: number, sMax: number): View {
  const s = Math.min(sMax, Math.max(1, v.s))
  if (s === 1) return FIT
  return {
    s,
    tx: clampAxis(v.tx, s, rect.x, rect.w, cw),
    ty: clampAxis(v.ty, s, rect.y, rect.h, ch)
  }
}

/** Zoom to scale `s` keeping stage point (px, py) fixed on screen. Not clamped. */
export function zoomAt(v: View, s: number, px: number, py: number): View {
  const k = s / v.s
  return { s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }
}
