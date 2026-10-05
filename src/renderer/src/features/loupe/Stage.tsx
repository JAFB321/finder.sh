import { useEffect, useRef, useState } from 'react'
import { assetUrl, thumbUrl } from '@renderer/lib/api'
import { loadImage, readyImage } from './preload'
import { fitRect, needsFullTier } from './zoom'
import { ZoomController } from './zoomController'

const PAD = 16

interface Layer {
  key: number
  id: number
  thumb: string | null
  hi: string | null
  /** full-resolution decode (RAW/HEIC deep zoom), on top of `hi` */
  full: string | null
  ar: number
}

let layerSeq = 0

/**
 * Big image with progressive hi-res and zoom/pan. Images are stacked absolutely: the previous
 * one stays until the next has decoded, then the new one fades in on top (no layout animation,
 * so fast navigation cannot shift anything).
 */
export function Stage({
  id,
  ready,
  natW,
  embedded
}: {
  id: number
  /** thumbs exist for this asset */
  ready: boolean
  /** original pixel width (0 if unknown) */
  natW: number
  embedded?: boolean
}): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const badge = useRef<HTMLDivElement>(null)
  const [zc] = useState(() => new ZoomController())
  const [size, setSize] = useState({ cw: 0, ch: 0 })
  const [layers, setLayers] = useState<Layer[]>([])
  const [hiFailed, setHiFailed] = useState<number | null>(null)
  const [fullLoading, setFullLoading] = useState<number | null>(null)
  // Per-asset tier state, read from zoom callbacks (no re-render per wheel tick).
  const tier = useRef({ id, hiW: 0, requested: false })
  const checkFull = useRef<() => void>(() => {})

  // ---- loading ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return
    let alive = true
    tier.current = { id, hiW: 0, requested: false }
    const tUrl = thumbUrl(id, 1024)
    const hUrl = assetUrl(id)
    const put = (img: HTMLImageElement, hi: boolean): void => {
      if (!alive) return
      if (hi) {
        tier.current.hiW = img.naturalWidth
        // Already zoomed in when the hi-res arrived (e.g. zoomed on the 1024 thumb).
        window.setTimeout(() => checkFull.current(), 0)
      }
      const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5
      setLayers((prev) => {
        const top = prev[prev.length - 1]
        if (top && top.id === id) {
          if (!hi || top.hi) return prev
          return [...prev.slice(0, -1), { ...top, hi: hUrl }]
        }
        const next: Layer = {
          key: ++layerSeq,
          id,
          thumb: hi ? null : tUrl,
          hi: hi ? hUrl : null,
          full: null,
          ar
        }
        return [...(top ? [top] : []), next]
      })
    }
    const loadHi = (): void => {
      loadImage(hUrl).then(
        (img) => put(img, true),
        () => alive && setHiFailed(id)
      )
    }

    // Neighbour preloading usually has the hi-res ready: show it straight away.
    if (readyImage(hUrl)) {
      loadHi()
      return () => {
        alive = false
      }
    }
    loadImage(tUrl).then(
      (img) => put(img, false),
      () => {}
    )
    // Delay the (heavier) hi-res so holding an arrow key doesn't queue full-size decodes.
    const t = window.setTimeout(loadHi, 140)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [id, ready])

  // Third tier: fetch `?full=1` once the user zooms past the hi-res image's pixels.
  useEffect(() => {
    const check = (): void => {
      const t = tier.current
      if (t.requested || t.id !== id) return
      if (!needsFullTier(zc.scale, zc.fitWidth, t.hiW, natW, window.devicePixelRatio || 1)) return
      t.requested = true
      const fUrl = `${assetUrl(id)}?full=1`
      setFullLoading(id)
      // Not through the preload LRU: a decoded 24 MP bitmap is too big to keep around.
      const img = new Image()
      img.decoding = 'async'
      img.src = fUrl
      const done = (): void => setFullLoading((cur) => (cur === t.id ? null : cur))
      img.decode().then(() => {
        if (tier.current !== t) return done()
        setLayers((prev) => {
          const top = prev[prev.length - 1]
          if (!top || top.id !== t.id) return prev
          return [...prev.slice(0, -1), { ...top, full: fUrl }]
        })
        done()
      }, done)
    }
    checkFull.current = check
    zc.listen(check)
    check()
    return () => zc.listen(null)
  }, [zc, id, natW])

  // Drop the layer underneath once the new one has faded in.
  const top = layers[layers.length - 1]
  const topKey = top?.key
  useEffect(() => {
    if (topKey == null) return
    const t = window.setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev))
    }, 160)
    return () => window.clearTimeout(t)
  }, [topKey])

  // ---- size + zoom wiring ------------------------------------------------------------------
  useEffect(() => {
    const el = stage.current
    if (!el) return
    zc.attach(el, viewport.current, badge.current)
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }))
    ro.observe(el)
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zc.wheel(e, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
      zc.dispose()
    }
  }, [zc])

  const current = top && top.id === id ? top : null
  const ar = current?.ar ?? 1.5
  useEffect(() => {
    zc.setGeo({ rect: fitRect(size.cw, size.ch, ar, PAD), cw: size.cw, ch: size.ch, natW })
  }, [zc, ar, size.cw, size.ch, natW])

  useEffect(() => {
    zc.fit(false)
  }, [zc, id])

  // 0 = fit, 1 = 100 %. In the embedded filmstrip layout "1" stays the layout shortcut and
  // "0" only steals the key while zoomed (otherwise it clears the colour label).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '0' && (!embedded || zc.zoomed)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        zc.fit()
      } else if (e.key === '1' && !embedded) {
        e.preventDefault()
        e.stopImmediatePropagation()
        zc.actual(...zc.centre())
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [zc, embedded])

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (zc.zoomed) return zc.fit()
    const r = e.currentTarget.getBoundingClientRect()
    zc.actual(e.clientX - r.left, e.clientY - r.top)
  }

  const spinner =
    (ready && current && !current.hi && hiFailed !== id) || (fullLoading === id && !current?.full)

  return (
    <div
      ref={stage}
      onPointerDown={(e) => {
        if (zc.down(e.nativeEvent)) e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => zc.move(e.nativeEvent)}
      onPointerUp={(e) => zc.up(e.nativeEvent)}
      onPointerCancel={(e) => zc.up(e.nativeEvent)}
      onDoubleClick={onDoubleClick}
      className="absolute inset-0 overflow-hidden"
    >
      <div ref={viewport} className="absolute inset-0 origin-top-left">
        {size.cw > 0 &&
          ready &&
          layers.map((l) => {
            const r = fitRect(size.cw, size.ch, l.ar, PAD)
            return (
              <div
                key={l.key}
                className="absolute animate-[fade-in_120ms_ease-out_both] overflow-hidden rounded-[4px] shadow-[0_20px_60px_rgba(0,0,0,.5)]"
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              >
                {l.thumb && (
                  <img
                    src={l.thumb}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
                {l.hi && (
                  <img
                    src={l.hi}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
                {l.full && (
                  <img
                    src={l.full}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full animate-[fade-in_120ms_ease-out_both] object-contain"
                  />
                )}
              </div>
            )
          })}
      </div>
      <div
        ref={badge}
        style={{ display: 'none' }}
        className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10.5px] tabular-nums text-white/80 backdrop-blur"
      />
      {spinner && (
        <div
          key={id}
          className="pointer-events-none absolute bottom-3 right-3 flex h-6 w-6 animate-[fade-in_150ms_ease-out_250ms_both] items-center justify-center rounded-full bg-black/40 backdrop-blur"
        >
          <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/20 border-t-white/80" />
        </div>
      )}
    </div>
  )
}
