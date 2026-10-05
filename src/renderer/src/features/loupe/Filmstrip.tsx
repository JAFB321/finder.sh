import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetTile } from '@shared/types'
import { thumbUrl } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import {
  STRIP_GAP,
  STRIP_ITEM_H,
  centreScroll,
  itemWidth,
  prefixOffsets,
  visibleRange
} from './strip'

const PAD = 12
const OVERSCAN = 800
const TOP = (92 - STRIP_ITEM_H) / 2

/** Horizontally virtualized strip over every id. */
export function Filmstrip({
  ids,
  tiles,
  idx,
  onPick
}: {
  ids: number[]
  tiles: Map<number, AssetTile>
  idx: number
  onPick: (i: number) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ left: 0, width: 0 })

  const offsets = useMemo(() => {
    const widths = new Float64Array(ids.length)
    for (let i = 0; i < ids.length; i++) {
      const t = tiles.get(ids[i])
      widths[i] = itemWidth(t && t.w && t.h ? t.w / t.h : undefined)
    }
    return prefixOffsets(widths)
  }, [ids, tiles])
  const total = ids.length ? offsets[ids.length] - STRIP_GAP + PAD * 2 : 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const read = (): void => {
      raf = 0
      setVp({ left: el.scrollLeft, width: el.clientWidth })
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    // mouse wheels only scroll vertically; map that to horizontal
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1
      el.scrollLeft += e.deltaY * unit
    }
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    read()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  // Centre the cursor when it changes (instant on first paint, smooth afterwards).
  const first = useRef(true)
  useEffect(() => {
    const el = ref.current
    if (!el || !ids.length) return
    const left = centreScroll(offsets, idx, el.clientWidth, PAD)
    el.scrollTo({ left, behavior: first.current ? 'instant' : 'smooth' })
    first.current = false
    // offsets intentionally omitted: re-centring every time a tile page loads would fight the user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ids])

  const [start, end] = visibleRange(
    offsets,
    vp.left - PAD - OVERSCAN,
    vp.left - PAD + vp.width + OVERSCAN
  )
  const items: React.JSX.Element[] = []
  for (let i = start; i < end; i++) {
    const tid = ids[i]
    const t = tiles.get(tid)
    items.push(
      <button
        key={tid}
        data-i={i}
        onClick={() => onPick(i)}
        className={cn(
          'absolute overflow-hidden rounded-[4px] bg-bg-2 transition-[opacity,box-shadow] duration-150 ease-out-quart',
          i === idx ? 'ring-2 ring-accent' : 'opacity-75 hover:opacity-100'
        )}
        style={{
          left: PAD + offsets[i],
          top: TOP,
          width: offsets[i + 1] - offsets[i] - STRIP_GAP,
          height: STRIP_ITEM_H
        }}
      >
        {t?.thumb === 1 && (
          <img
            src={thumbUrl(tid, 256)}
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </button>
    )
  }

  return (
    <div
      ref={ref}
      data-filmstrip=""
      className="h-[92px] shrink-0 overflow-x-auto overflow-y-hidden border-t border-line bg-bg-1"
    >
      <div className="relative h-full" style={{ width: total }}>
        {items}
      </div>
    </div>
  )
}
