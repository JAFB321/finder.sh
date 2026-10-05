import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Columns3,
  Grid2x2,
  LayoutPanelTop,
  Rows3,
  Search,
  SidebarClose,
  SidebarOpen,
  X
} from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { LABEL_COLORS, type LayoutKind } from '@shared/types'
import { cn, debounce } from '@renderer/lib/utils'
import { useLibrary } from '../library/store'
import { IconBtn } from '../sources/Sidebar'
import { Tip } from '@renderer/components/ui/Tooltip'

const LAYOUTS: { kind: LayoutKind; icon: React.ReactNode; title: string }[] = [
  { kind: 'justified', icon: <Rows3 size={14} />, title: 'Justified (1)' },
  { kind: 'grid', icon: <Grid2x2 size={14} />, title: 'Grid (2)' },
  { kind: 'masonry', icon: <Columns3 size={14} />, title: 'Masonry (3)' },
  { kind: 'filmstrip', icon: <LayoutPanelTop size={14} />, title: 'Filmstrip (4)' },
  { kind: 'timeline', icon: <CalendarDays size={14} />, title: 'Timeline (Y)' }
]

export function Toolbar(): React.JSX.Element {
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const layout = useLibrary((s) => s.layout)
  const setLayout = useLibrary((s) => s.setLayout)
  const size = useLibrary((s) => s.size)
  const setSize = useLibrary((s) => s.setSize)
  const total = useLibrary((s) => s.ids.length)
  const selected = useLibrary((s) => s.selected.size)
  const inspector = useLibrary((s) => s.inspector)
  const toggleInspector = useLibrary((s) => s.toggleInspector)

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-bg-1 pl-3 pr-2">
      <SearchBox
        value={filter.text ?? ''}
        onChange={(text) => setFilter({ text: text || undefined, similarTo: undefined })}
      />
      <LabelFilter />
      <ColorFilter />
      {filter.similarTo && (
        <Chip
          label={`Similar to #${filter.similarTo}`}
          onClear={() => setFilter({ similarTo: undefined })}
        />
      )}
      {filter.color && (
        <Chip label="Color" swatch={filter.color} onClear={() => setFilter({ color: undefined })} />
      )}
      <div className="flex-1" />
      <span className="no-drag text-[11.5px] tabular-nums text-fg-3">
        {selected ? `${selected} of ` : ''}
        {total.toLocaleString()}
      </span>
      <div className="no-drag mx-1 flex items-center gap-0.5 rounded-[6px] bg-white/[0.04] p-0.5">
        {LAYOUTS.map((l) => (
          <IconBtn
            key={l.kind}
            title={l.title}
            active={layout === l.kind}
            onClick={() => setLayout(l.kind)}
          >
            {l.icon}
          </IconBtn>
        ))}
      </div>
      <Tip label="Thumbnail size" shortcut="− / =">
        <input
          type="range"
          min={100}
          max={400}
          step={10}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="no-drag h-1 w-[90px] cursor-pointer appearance-none rounded bg-white/[0.12] accent-[var(--color-accent)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg"
        />
      </Tip>
      <div className="no-drag">
        <IconBtn title="Inspector (I)" active={inspector} onClick={toggleInspector}>
          {inspector ? <SidebarClose size={14} /> : <SidebarOpen size={14} />}
        </IconBtn>
      </div>
    </div>
  )
}

function SearchBox({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  const [local, setLocal] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // external filter change (chip cleared, smart collection opened): sync input
    setPrev(value)
    setLocal(value)
  }
  const ref = useRef<HTMLInputElement>(null)
  const push = useRef(debounce(onChange, 350))
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        ref.current?.focus()
        ref.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="no-drag relative flex h-[30px] w-[300px] items-center rounded-[7px] bg-white/[0.05] pl-2 pr-1 ring-1 ring-transparent transition-shadow focus-within:bg-white/[0.07] focus-within:ring-accent/60">
      <Search size={13} className="shrink-0 text-fg-3" />
      <input
        ref={ref}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value)
          push.current(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setLocal('')
            onChange('')
            ref.current?.blur()
          }
          if (e.key === 'Enter') onChange(local)
        }}
        placeholder="Search names, folders, keywords… or describe it"
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-[12.5px] placeholder:text-fg-3 focus:outline-none"
      />
      {local && (
        <button
          onClick={() => {
            setLocal('')
            onChange('')
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-fg-3 hover:text-fg"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function LabelFilter(): React.JSX.Element {
  const labelsSel = useLibrary((s) => s.filter.labels)
  const labels = labelsSel ?? []
  const setFilter = useLibrary((s) => s.setFilter)
  const toggle = (l: number): void =>
    setFilter({ labels: labels.includes(l) ? labels.filter((x) => x !== l) : [...labels, l] })
  return (
    <div className="no-drag flex items-center gap-1 rounded-[7px] bg-white/[0.04] px-1.5 py-1">
      {Object.entries(LABEL_COLORS).map(([k, c]) => {
        const l = Number(k)
        const on = labels.includes(l)
        return (
          <Tip key={k} label={`${c.name} label`} shortcut={String(l === 5 ? 5 : l + 5)}>
            <button
              aria-label={`${c.name} label`}
              onClick={() => toggle(l)}
              className={cn(
                'h-[14px] w-[14px] rounded-full transition-transform duration-150 ease-spring hover:scale-110',
                on ? 'scale-110 ring-2 ring-white/80' : 'opacity-60 hover:opacity-100'
              )}
              style={{ background: c.hex }}
            />
          </Tip>
        )
      })}
    </div>
  )
}

const SWATCHES = [
  '#e11d48',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f5f5f4',
  '#a8a29e',
  '#57534e',
  '#1c1917'
]

function ColorFilter(): React.JSX.Element {
  const color = useLibrary((s) => s.filter.color)
  const setFilter = useLibrary((s) => s.setFilter)
  return (
    <Popover.Root>
      <Tip label="Filter by color">
        <Popover.Trigger asChild>
          <button className="no-drag flex h-[30px] items-center gap-1.5 rounded-[7px] bg-white/[0.04] px-2 text-[12px] text-fg-2 hover:bg-white/[0.06] hover:text-fg">
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/20"
              style={{
                background:
                  color ?? 'conic-gradient(#e11d48,#eab308,#22c55e,#3b82f6,#8b5cf6,#e11d48)'
              }}
            />
            Color
          </button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 w-[196px] rounded-[10px] border border-line bg-bg-2 p-2 shadow-2xl outline-none data-[state=open]:animate-[fade-in_120ms_ease-out]"
        >
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((s) => (
              <button
                key={s}
                onClick={() => setFilter({ color: s, similarTo: undefined })}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform duration-150 ease-spring hover:scale-110',
                  color === s && 'ring-2 ring-white/80'
                )}
                style={{ background: s }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={color ?? '#808080'}
              onChange={(e) => setFilter({ color: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="flex-1 text-[11px] text-fg-3">custom</span>
            {color && (
              <button
                onClick={() => setFilter({ color: undefined })}
                className="text-[11px] text-fg-2 hover:text-fg"
              >
                clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Chip({
  label,
  swatch,
  onClear
}: {
  label: string
  swatch?: string
  onClear: () => void
}): React.JSX.Element {
  return (
    <span className="no-drag flex h-[26px] items-center gap-1.5 rounded-full bg-accent/15 pl-2.5 pr-1 text-[11.5px] text-fg">
      {swatch && <span className="h-3 w-3 rounded-full" style={{ background: swatch }} />}
      {label}
      <button
        onClick={onClear}
        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10"
      >
        <X size={11} />
      </button>
    </span>
  )
}
