import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLibrary } from './store'
import { BoxIndex, computeLayout, headerAt, navigate, type Box } from './layouts'
import { Tile } from './Tile'
import { invoke } from '@renderer/lib/api'
import { cn, debounce } from '@renderer/lib/utils'
import { Scrubber } from '../timeline/Scrubber'
import { SectionHeaderRow, GroupSwitch } from '../timeline/SectionHeader'
import { groupByTime, resolveGroup, type TimeGroup } from '../timeline/sections'

const GAP = 6
const PAD = 12
const OVERSCAN = 600
const HEADER_H = 36
const SECTION_GAP = 24
/** extra right margin in the timeline so tiles never sit under the scrubber */
const SCRUB_W = 28
const GROUPS: TimeGroup[] = ['year', 'month', 'day']

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
  const filter = useLibrary((s) => s.filter)
  const groupSetting = useLibrary((s) => s.timelineGroup)
  const setGroup = useLibrary((s) => s.setTimelineGroup)

  const timeline = layout === 'timeline'
  const group = resolveGroup(groupSetting, size)

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

  const sections = useMemo(
    () => (timeline ? groupByTime(ids, tiles, group) : null),
    [timeline, ids, tiles, group]
  )

  const contentWidth = timeline ? width - (SCRUB_W - PAD) : width
  const result = useMemo(
    () =>
      computeLayout(items, {
        kind: layout === 'filmstrip' ? 'justified' : layout,
        width: contentWidth,
        size,
        gap: GAP,
        sections: sections ?? undefined,
        headerHeight: HEADER_H,
        sectionGap: SECTION_GAP
      }),
    [items, layout, contentWidth, size, sections]
  )
  const headers = useMemo(() => result.headers ?? [], [result])
  const index = useMemo(() => new BoxIndex(result.boxes), [result])

  const visible: Box[] = useMemo(
    () => index.visible(scroll.top - OVERSCAN, scroll.top + scroll.height + OVERSCAN),
    [index, scroll]
  )

  // sticky header: the section whose header has scrolled past the top (or the first one)
  const floating = Math.max(0, headerAt(headers, scroll.top - PAD))
  const visibleHeaders = useMemo(() => {
    if (!headers.length) return []
    const from = Math.max(0, headerAt(headers, scroll.top - PAD - OVERSCAN))
    const out: number[] = []
    for (let k = from; k < headers.length; k++) {
      if (headers[k].y > scroll.top + scroll.height + OVERSCAN) break
      out.push(k)
    }
    return out
  }, [headers, scroll])

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

  // one state update per frame at most, however many scroll events fire
  const raf = useRef(0)
  const onScroll = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const el = scroller.current
      if (el) setScroll({ top: el.scrollTop, height: el.clientHeight })
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // a new filter is a new result set: start from the top
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = 0
    setScroll((s) => (s.top === 0 ? s : { ...s, top: 0 }))
  }, [filter])

  const seek = useCallback((top: number) => {
    scroller.current?.scrollTo({ top })
  }, [])

  // keep cursor in view (below the floating header in the timeline)
  useEffect(() => {
    if (cursor < 0) return
    const b = result.boxes[cursor]
    const el = scroller.current
    if (!b || !el) return
    const top = b.y + PAD
    const bottom = top + b.h
    const margin = timeline ? HEADER_H + 8 : 8
    if (top < el.scrollTop + margin) el.scrollTo({ top: top - margin, behavior: 'smooth' })
    else if (bottom > el.scrollTop + el.clientHeight - 8)
      el.scrollTo({ top: bottom - el.clientHeight + 8, behavior: 'smooth' })
  }, [cursor, result, timeline])

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
      if (timeline && (e.key === '[' || e.key === ']') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const k = GROUPS.indexOf(group) + (e.key === '[' ? -1 : 1)
        if (k >= 0 && k < GROUPS.length) setGroup(GROUPS[k])
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
  }, [result, cursor, select, setLoupe, clearSelection, timeline, group, setGroup])

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

  // floating header: sticks at the top, pushed up by the next section's header
  let floatTop = 0
  if (timeline && headers.length) {
    const cur = headers[floating]
    floatTop = Math.max(0, PAD + cur.y - scroll.top)
    const next = headers[floating + 1]
    if (next) floatTop += Math.min(0, PAD + next.y - scroll.top - HEADER_H)
  }

  const contain = layout === 'grid'
  const maxScroll = Math.max(0, result.height + PAD * 2 - scroll.height)
  return (
    <div className="relative h-full w-full">
      <div
        ref={scroller}
        data-scroller=""
        onScroll={onScroll}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas)
            clearSelection()
        }}
        className={cn(
          'relative h-full w-full overflow-y-auto overflow-x-hidden',
          // the scrubber replaces the native scrollbar
          timeline && '[scrollbar-width:none]'
        )}
      >
        <div
          data-canvas="1"
          className="relative"
          style={{
            height: result.height + PAD * 2,
            marginLeft: PAD,
            marginRight: timeline ? SCRUB_W : PAD
          }}
        >
          <div data-canvas="1" className="absolute inset-x-0" style={{ top: PAD }}>
            {timeline &&
              visibleHeaders.map((k) =>
                k === floating ? null : (
                  <SectionHeaderRow
                    key={`h${headers[k].firstIndex}`}
                    label={headers[k].label}
                    count={headers[k].count}
                    className="absolute inset-x-0"
                    style={{ top: headers[k].y, height: HEADER_H }}
                  />
                )
              )}
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
      {timeline && headers.length > 0 && (
        <>
          <SectionHeaderRow
            label={headers[floating].label}
            count={headers[floating].count}
            floating
            className="absolute left-0 z-10"
            style={{ top: floatTop, right: SCRUB_W, height: HEADER_H, paddingLeft: PAD }}
          >
            <GroupSwitch value={groupSetting} effective={group} onChange={setGroup} />
          </SectionHeaderRow>
          <Scrubber
            headers={headers}
            sections={sections ?? []}
            group={group}
            contentTop={PAD}
            scrollTop={scroll.top}
            maxScroll={maxScroll}
            viewHeight={scroll.height}
            onSeek={seek}
          />
        </>
      )}
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
