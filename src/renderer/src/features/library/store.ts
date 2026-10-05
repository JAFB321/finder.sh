import { create } from 'zustand'
import type { AssetTile, LayoutKind, LibraryFilter } from '@shared/types'
import { invoke } from '@renderer/lib/api'
import { timelineOrder, type TimeGroupSetting } from '../timeline/sections'

const PAGE = 2000

interface LibraryState {
  filter: LibraryFilter
  layout: LayoutKind
  /** 100..400 — row height / cell size */
  size: number
  ids: number[]
  tiles: Map<number, AssetTile>
  loading: boolean
  /** generation counter to drop stale responses */
  gen: number
  selected: Set<number>
  /** index into ids of the keyboard cursor */
  cursor: number
  anchor: number
  loupe: boolean
  inspector: boolean
  /** timeline grouping; 'auto' follows thumb size */
  timelineGroup: TimeGroupSetting

  setFilter: (patch: Partial<LibraryFilter> | ((f: LibraryFilter) => LibraryFilter)) => void
  setLayout: (l: LayoutKind) => void
  setSize: (s: number) => void
  reload: () => Promise<void>
  patchTiles: (ids: number[]) => Promise<void>
  select: (index: number, mode: 'single' | 'toggle' | 'range') => void
  selectAll: () => void
  clearSelection: () => void
  setCursor: (i: number) => void
  setLoupe: (v: boolean) => void
  toggleInspector: () => void
  setTimelineGroup: (g: TimeGroupSetting) => void
}

const persisted = (() => {
  try {
    return JSON.parse(localStorage.getItem('tf.ui') ?? '{}') as Partial<
      Pick<LibraryState, 'layout' | 'size' | 'inspector' | 'timelineGroup'>
    >
  } catch {
    return {}
  }
})()

/**
 * Ids in server order. The timeline re-sorts client-side (takenAt desc, undated last) so it
 * works for any filter/sort (similar-to, random…) and switching layouts never refetches;
 * leaving the timeline restores this order.
 */
let baseIds: number[] = []

/** Ids as shown by the current layout, with cursor/anchor remapped by id. */
function ordered(
  s: Pick<LibraryState, 'layout' | 'tiles' | 'ids' | 'cursor' | 'anchor'>,
  layout = s.layout,
  tiles = s.tiles
): Pick<LibraryState, 'ids' | 'cursor' | 'anchor'> {
  const ids = layout === 'timeline' ? timelineOrder(baseIds, tiles) : baseIds
  const remap = (i: number): number => {
    if (i < 0 || s.ids[i] == null) return i
    return ids === s.ids ? i : ids.indexOf(s.ids[i])
  }
  return { ids, cursor: remap(s.cursor), anchor: remap(s.anchor) }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  filter: { sort: 'takenAt', sortDir: 'desc' },
  layout: persisted.layout ?? 'justified',
  size: persisted.size ?? 220,
  ids: [],
  tiles: new Map(),
  loading: false,
  gen: 0,
  selected: new Set(),
  cursor: -1,
  anchor: -1,
  loupe: false,
  inspector: persisted.inspector ?? true,
  timelineGroup: persisted.timelineGroup ?? 'auto',

  setFilter: (patch) => {
    const f = typeof patch === 'function' ? patch(get().filter) : { ...get().filter, ...patch }
    for (const k of Object.keys(f) as (keyof LibraryFilter)[]) {
      const v = f[k]
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete f[k]
    }
    set({ filter: f, selected: new Set(), cursor: -1, anchor: -1 })
    void get().reload()
  },
  setLayout: (layout) => {
    const s = get()
    const reorder = (layout === 'timeline') !== (s.layout === 'timeline')
    set(reorder ? { layout, ...ordered(s, layout) } : { layout })
    persist(get())
  },
  setSize: (size) => {
    set({ size: Math.min(400, Math.max(100, size)) })
    persist(get())
  },

  reload: async () => {
    const gen = get().gen + 1
    set({ gen, loading: true })
    const filter = get().filter
    const first = await invoke('library:query', { filter, offset: 0, limit: PAGE })
    if (get().gen !== gen) return
    const tiles = new Map(get().tiles)
    for (const t of first.items) tiles.set(t.id, t)
    // ids come from the same resolved order; fetch the rest in pages
    const ids = await invoke('library:ids', { filter })
    if (get().gen !== gen) return
    baseIds = ids
    set({ tiles, loading: ids.length > first.items.length, ...ordered({ ...get(), tiles }) })
    for (let off = first.items.length; off < ids.length; off += PAGE) {
      const page = await invoke('library:query', { filter, offset: off, limit: PAGE })
      if (get().gen !== gen) return
      const t2 = new Map(get().tiles)
      for (const t of page.items) t2.set(t.id, t)
      set(
        get().layout === 'timeline'
          ? { tiles: t2, ...ordered({ ...get(), tiles: t2 }) }
          : { tiles: t2 }
      )
    }
    set({ loading: false })
    // keep selection only for ids still present
    const present = new Set(ids)
    const selected = new Set([...get().selected].filter((id) => present.has(id)))
    set({ selected })
  },

  patchTiles: async (ids) => {
    const mine = new Set(get().ids)
    const want = ids.filter((id) => mine.has(id))
    if (!want.length) return
    const fresh = await invoke('library:tiles', { ids: want })
    const prev = get().tiles
    const tiles = new Map(prev)
    let datesChanged = false
    for (const t of fresh) {
      if (prev.get(t.id)?.takenAt !== t.takenAt) datesChanged = true
      tiles.set(t.id, t)
    }
    set(
      datesChanged && get().layout === 'timeline'
        ? { tiles, ...ordered({ ...get(), tiles }) }
        : { tiles }
    )
  },

  select: (index, mode) => {
    const { ids, selected, anchor } = get()
    const id = ids[index]
    if (id == null) return
    if (mode === 'single') set({ selected: new Set([id]), cursor: index, anchor: index })
    else if (mode === 'toggle') {
      const s = new Set(selected)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      set({ selected: s, cursor: index, anchor: index })
    } else {
      const a = anchor < 0 ? index : anchor
      const [lo, hi] = a < index ? [a, index] : [index, a]
      const s = new Set(selected)
      for (let i = lo; i <= hi; i++) s.add(ids[i])
      set({ selected: s, cursor: index })
    }
  },
  selectAll: () => set({ selected: new Set(get().ids) }),
  clearSelection: () => set({ selected: new Set(), loupe: false }),
  setCursor: (cursor) => set({ cursor }),
  setLoupe: (loupe) => set({ loupe }),
  toggleInspector: () => {
    set({ inspector: !get().inspector })
    persist(get())
  },
  setTimelineGroup: (timelineGroup) => {
    set({ timelineGroup })
    persist(get())
  }
}))

function persist(s: LibraryState): void {
  localStorage.setItem(
    'tf.ui',
    JSON.stringify({
      layout: s.layout,
      size: s.size,
      inspector: s.inspector,
      timelineGroup: s.timelineGroup
    })
  )
}

/** Primary selected id (cursor first, else any selected). */
export function primarySelected(
  s: Pick<LibraryState, 'ids' | 'cursor' | 'selected'>
): number | null {
  const c = s.ids[s.cursor]
  if (c != null && s.selected.has(c)) return c
  const first = s.selected.values().next()
  return first.done ? null : first.value
}
