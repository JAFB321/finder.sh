import { useEffect, useMemo, useRef, useState } from 'react'
import { headerAt, type SectionHeader } from '../library/layouts'
import { monthAbbr, shortLabel, UNKNOWN, type TimeGroup, type TimeSection } from './sections'

const INSET = 10 // track padding top/bottom
const MIN_YEAR_GAP = 14
const MIN_MONTH_GAP = 26

interface Props {
  headers: SectionHeader[]
  /** parallel to headers */
  sections: TimeSection[]
  group: TimeGroup
  /** offset of layout y=0 inside the scroller */
  contentTop: number
  scrollTop: number
  maxScroll: number
  viewHeight: number
  onSeek: (top: number) => void
}

interface Tick {
  y: number
  kind: 'year' | 'month' | 'unknown'
  text: string
  /** draw the text (enough room since the previous label) */
  label: boolean
}

/**
 * Google Photos / Immich-style scrubber: a labelled scrollbar. Positions are proportional to
 * scroll offset (not to time), so dragging is continuous and a tick sits exactly where its
 * section reaches the top of the viewport.
 */
export function Scrubber(p: Props): React.JSX.Element | null {
  const { headers, sections, group, contentTop, scrollTop, maxScroll, viewHeight, onSeek } = p
  const root = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hover, setHover] = useState<{ y: number; text: string } | null>(null)
  const track = Math.max(0, viewHeight - INSET * 2)

  const toY = (top: number): number =>
    INSET + (maxScroll > 0 ? Math.min(1, Math.max(0, top / maxScroll)) : 0) * track
  const toTop = (y: number): number =>
    track > 0 ? Math.min(1, Math.max(0, (y - INSET) / track)) * maxScroll : 0

  const ticks = useMemo(() => {
    const out: Tick[] = []
    if (!headers.length || track <= 0) return out
    const at = (hy: number): number =>
      INSET + (maxScroll > 0 ? Math.min(1, (hy + contentTop) / maxScroll) : 0) * track
    let lastYear = NaN
    let lastMonth = NaN
    let lastLabelY = -Infinity
    for (let k = 0; k < headers.length; k++) {
      const key = sections[k]?.key ?? UNKNOWN
      const y = at(headers[k].y)
      if (key === UNKNOWN) {
        out.push({ y, kind: 'unknown', text: '?', label: y - lastLabelY >= MIN_YEAR_GAP })
        continue
      }
      const d = new Date(key)
      const yr = d.getFullYear()
      const mo = yr * 12 + d.getMonth()
      if (yr !== lastYear) {
        const label = y - lastLabelY >= MIN_YEAR_GAP
        out.push({ y, kind: 'year', text: String(yr), label })
        if (label) lastLabelY = y
      } else if (mo !== lastMonth && group !== 'year') {
        const label = y - lastLabelY >= MIN_MONTH_GAP
        out.push({ y, kind: 'month', text: monthAbbr(key), label })
        if (label) lastLabelY = y
      }
      lastYear = yr
      lastMonth = mo
    }
    return out
  }, [headers, sections, group, contentTop, maxScroll, track])

  // flash to full opacity while scrolling; DOM-only so scrolling never re-renders for this
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.dataset.active = '1'
    const t = setTimeout(() => delete el.dataset.active, 900)
    return () => clearTimeout(t)
  }, [scrollTop])

  const labelAt = (top: number): string => {
    const k = headerAt(headers, top - contentTop + 1)
    return k < 0 ? '' : shortLabel(sections[Math.max(0, k)]?.key ?? UNKNOWN, group)
  }

  if (!headers.length || maxScroll <= 0) return null

  const localY = (e: React.PointerEvent): number =>
    e.clientY - (root.current?.getBoundingClientRect().top ?? 0)
  const markerY = toY(scrollTop)
  const markerText = labelAt(scrollTop)

  return (
    <div
      ref={root}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.dataset.dragging = '1'
        onSeek(toTop(localY(e)))
      }}
      onPointerMove={(e) => {
        const y = localY(e)
        const top = toTop(y)
        setHover({ y: Math.min(Math.max(y, INSET), INSET + track), text: labelAt(top) })
        if (dragging.current) onSeek(top)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        delete e.currentTarget.dataset.dragging
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerLeave={() => !dragging.current && setHover(null)}
      className="group/scrub absolute inset-y-0 right-0 z-20 w-7 cursor-ns-resize select-none opacity-40 transition-opacity duration-150 ease-out hover:opacity-100 data-[active]:opacity-100 data-[dragging]:opacity-100"
    >
      <div className="absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-bg/80 to-transparent" />
      {ticks.map((t, i) =>
        t.label ? (
          <span
            key={i}
            className={
              t.kind === 'year'
                ? 'absolute right-1 -translate-y-1/2 text-[9.5px] font-semibold tabular-nums leading-none text-fg-2'
                : 'absolute right-1 -translate-y-1/2 text-[9px] leading-none text-fg-3'
            }
            style={{ top: t.y }}
          >
            {t.text}
          </span>
        ) : (
          <span
            key={i}
            className="absolute right-[7px] h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-fg-3/70"
            style={{ top: t.y }}
          />
        )
      )}
      <div
        className="pointer-events-none absolute right-0 h-[2px] w-7 -translate-y-1/2 rounded-full bg-accent"
        style={{ top: markerY }}
      >
        {markerText && !hover && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-[5px] bg-bg-3/95 px-1.5 py-[3px] text-[10.5px] font-medium text-fg opacity-0 shadow-lg ring-1 ring-line-2 transition-opacity duration-150 group-hover/scrub:opacity-100 group-data-[active]/scrub:opacity-100">
            {markerText}
          </span>
        )}
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute right-0 w-7 -translate-y-1/2 border-t border-fg/60"
          style={{ top: hover.y }}
        >
          <span className="absolute right-8 top-0 -translate-y-1/2 whitespace-nowrap rounded-[5px] bg-bg-3/95 px-1.5 py-[3px] text-[10.5px] font-medium text-fg shadow-lg ring-1 ring-line-2">
            {hover.text}
          </span>
        </div>
      )}
    </div>
  )
}
