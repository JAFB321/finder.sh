import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLibrary } from './store'
import { BoxIndex, computeLayout, navigate, type Box } from './layouts'
import { Tile } from './Tile'
import { invoke } from '@renderer/lib/api'
import { debounce } from '@renderer/lib/utils'

const GAP = 6
const PAD = 12
const OVERSCAN = 600

export function Grid(): React.JSX.Element {
  const ids = useLibrary((s) => s.ids)
  const tiles = useLibrary((s) => s.tiles)
  const layout = useLibrary((s) => s.layout)
  const size = useLibrary((s) => s.size)
  const selected = useLibrary((s) => s.selected)
  const cursor = useLibrary((s) => s.cursor)
  const select = useLibrary((s) => s.select)
  const setCursor = useLibrary((s) => s.setCursor)
  const setLoupe = useLibrary((s) => s.setLoupe)
  const clearSelection = useLibrary((s) => s.clearSelection)

  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [scroll, setScroll] = useState({ top: 0, height: 0 })

  useLayoutEffect(() => {
    const el = scroller.current!
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth - PAD * 2)
      setScroll((s) => ({ ...s, height: el.clientHeight }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const items = useMemo(
    () =>
      ids.map((id) => {
        const t = tiles.get(id)
        return { id, ar: t && t.w && t.h ? t.w / t.h : 0 }
      }),
    [ids, tiles]
  )

  const result = useMemo(
    () =>
      computeLayout(items, {
        kind: layout === 'filmstrip' ? 'justified' : layout,
        width,
        size,
        gap: GAP
      }),
    [items, layout, width, size]
  )
  const index = useMemo(() => new BoxIndex(result.boxes), [result])

  const visible: Box[] = useMemo(
    () => index.visible(scroll.top - OVERSCAN, scroll.top + scroll.height + OVERSCAN),
    [index, scroll]
  )

  // tell main which assets are on screen so their jobs get priority
  const hint = useMemo(
    () =>
      debounce((boxes: Box[]) => {
        const pending = boxes.filter((b) => (tiles.get(b.id)?.thumb ?? 0) === 0).map((b) => b.id)
        if (pending.length) void invoke('library:viewport', { ids: pending.slice(0, 200) })
      }, 120),
    [tiles]
  )
  useEffect(() => hint(visible), [visible, hint])

  const onScroll = useCallback(() => {
    const el = scroller.current!
    setScroll({ top: el.scrollTop, height: el.clientHeight })
  }, [])

  // keep cursor in view
  useEffect(() => {
    if (cursor < 0) return
    const b = result.boxes[cursor]
    const el = scroller.current
    if (!b || !el) return
    const top = b.y + PAD
    const bottom = top + b.h
    if (top < el.scrollTop + 8) el.scrollTo({ top: top - 8, behavior: 'smooth' })
    else if (bottom > el.scrollTop + el.clientHeight - 8)
      el.scrollTo({ top: bottom - el.clientHeight + 8, behavior: 'smooth' })
  }, [cursor, result])

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right'
      }
      const dir = dirs[e.key]
      if (dir) {
        e.preventDefault()
        const next = navigate(result.boxes, cursor, dir)
        if (next >= 0) select(next, e.shiftKey ? 'range' : 'single')
        return
      }
      if ((e.key === ' ' || e.key === 'Enter') && cursor >= 0) {
        e.preventDefault()
        setLoupe(true)
      } else if (e.key === 'Escape') {
        clearSelection()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        useLibrary.getState().selectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, cursor, select, setLoupe, clearSelection])

  const onTileDown = useCallback(
    (i: number, e: React.MouseEvent) => {
      if (e.button !== 0) {
        // right click: keep selection if inside, else select
        if (!selected.has(ids[i])) select(i, 'single')
        return
      }
      if (e.shiftKey) select(i, 'range')
      else if (e.metaKey || e.ctrlKey) select(i, 'toggle')
      else select(i, 'single')
    },
    [select, selected, ids]
  )

  const contain = layout === 'grid'
  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas)
          clearSelection()
      }}
      className="relative h-full w-full overflow-y-auto overflow-x-hidden"
    >
      <div
        data-canvas="1"
        className="relative"
        style={{ height: result.height + PAD * 2, margin: `0 ${PAD}px` }}
      >
        <div data-canvas="1" className="absolute inset-x-0" style={{ top: PAD }}>
          {visible.map((b) => (
            <Tile
              key={b.id}
              id={b.id}
              tile={tiles.get(b.id)}
              x={b.x}
              y={b.y}
              w={b.w}
              h={b.h}
              contain={contain}
              selected={selected.has(b.id)}
              focused={cursor === b.i}
              onMouseDown={(e) => onTileDown(b.i, e)}
              onDoubleClick={() => {
                setCursor(b.i)
                setLoupe(true)
              }}
            />
          ))}
        </div>
      </div>
      {!ids.length && <Empty />}
    </div>
  )
}

function Empty(): React.JSX.Element {
  const loading = useLibrary((s) => s.loading)
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-3">
      <div className="text-[15px] font-medium text-fg-2">
        {loading ? 'Loading…' : 'Nothing here'}
      </div>
      <div className="text-[12px]">
        {loading ? '' : 'Add a folder from the sidebar, or loosen the filters.'}
      </div>
    </div>
  )
}
