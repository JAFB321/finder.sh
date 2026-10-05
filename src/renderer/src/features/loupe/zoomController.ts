import { FIT, clampView, maxScale, zoomAt, type Rect, type View } from './zoom'

const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'

export interface Geo {
  rect: Rect
  cw: number
  ch: number
  /** original pixel width, 0 if unknown */
  natW: number
}

/**
 * Imperative zoom/pan state for the loupe stage. Lives outside React so pointer and wheel
 * events never trigger a render: state is kept here and written to the DOM once per frame.
 */
export class ZoomController {
  private view: View = FIT
  private geo: Geo = { rect: { x: 0, y: 0, w: 1, h: 1 }, cw: 1, ch: 1, natW: 0 }
  private raf = 0
  private idle = 0
  private animate = false
  private drag: { x: number; y: number; tx: number; ty: number; pid: number } | null = null
  private stage: HTMLElement | null = null
  private viewport: HTMLElement | null = null
  private badge: HTMLElement | null = null

  attach(stage: HTMLElement | null, viewport: HTMLElement | null, badge: HTMLElement | null): void {
    this.stage = stage
    this.viewport = viewport
    this.badge = badge
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.idle)
    this.raf = 0
  }

  setGeo(g: Geo): void {
    this.geo = g
    this.set(this.view)
  }

  /** Scale (relative to fit) at which one image pixel = one CSS pixel. */
  get oneToOne(): number {
    return this.geo.natW > 0 ? this.geo.natW / this.geo.rect.w : 1
  }

  get zoomed(): boolean {
    return this.view.s > 1.001
  }

  set(v: View, animate = false): void {
    const g = this.geo
    this.view = clampView(v, g.rect, g.cw, g.ch, maxScale(this.oneToOne))
    if (animate) this.animate = true
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0
        this.paint()
      })
  }

  fit(animate = true): void {
    this.set(FIT, animate)
  }

  /** Toggle target for double-click / "1": 100 % pixels, or 2× when the image is small. */
  actual(px: number, py: number): void {
    const s = this.oneToOne > 1.01 ? this.oneToOne : 2
    this.set(zoomAt(this.view, s, px, py), true)
  }

  centre(): [number, number] {
    return [this.geo.cw / 2, this.geo.ch / 2]
  }

  wheel(e: WheelEvent, px: number, py: number): void {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    const dy = Math.max(-120, Math.min(120, e.deltaY * unit))
    // pinch arrives as ctrl+wheel with small deltas; mouse wheels send ~100 per notch
    const k = e.ctrlKey ? 0.012 : 0.0025
    const s = Math.max(1, Math.min(maxScale(this.oneToOne), this.view.s * Math.exp(-dy * k)))
    this.set(zoomAt(this.view, s, px, py))
  }

  down(e: PointerEvent): boolean {
    if (e.button !== 0 || !this.zoomed) return false
    this.drag = { x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, pid: e.pointerId }
    if (this.stage) this.stage.style.cursor = 'grabbing'
    return true
  }

  move(e: PointerEvent): void {
    const d = this.drag
    if (!d || d.pid !== e.pointerId) return
    this.set({ s: this.view.s, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y })
  }

  up(e: PointerEvent): void {
    if (!this.drag || this.drag.pid !== e.pointerId) return
    this.drag = null
    if (this.stage) this.stage.style.cursor = this.zoomed ? 'grab' : ''
  }

  private paint(): void {
    const el = this.viewport
    if (!el) return
    const v = this.view
    el.style.transition = this.animate ? `transform 160ms ${EASE}` : 'none'
    this.animate = false
    el.style.willChange = 'transform'
    el.style.transform = `translate3d(${v.tx}px, ${v.ty}px, 0) scale(${v.s})`
    // Drop the compositor hint once motion stops so Chromium re-rasters sharp at the new scale.
    window.clearTimeout(this.idle)
    this.idle = window.setTimeout(() => {
      el.style.willChange = 'auto'
    }, 220)
    const zoomed = this.zoomed
    if (this.stage && !this.drag) this.stage.style.cursor = zoomed ? 'grab' : ''
    if (this.badge) {
      this.badge.style.display = zoomed ? '' : 'none'
      const pct = this.geo.natW > 0 ? (v.s / this.oneToOne) * 100 : v.s * 100
      this.badge.textContent = `${Math.round(pct)}%`
    }
  }
}
