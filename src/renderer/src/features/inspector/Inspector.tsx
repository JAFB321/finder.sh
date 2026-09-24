import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, FolderOpen, Sparkles, X } from 'lucide-react'
import { LABEL_COLORS, type AssetDetail, type Keyword } from '@shared/types'
import { invoke, thumbUrl, usePush } from '@renderer/lib/api'
import { cn, formatBytes, formatDate, formatShutter } from '@renderer/lib/utils'
import { primarySelected, useLibrary } from '../library/store'

export function Inspector(): React.JSX.Element {
  const selected = useLibrary((s) => s.selected)
  const ids = useLibrary((s) => s.ids)
  const cursor = useLibrary((s) => s.cursor)
  const setFilter = useLibrary((s) => s.setFilter)
  const id = primarySelected({ ids, cursor, selected })
  const [d, setD] = useState<AssetDetail | null>(null)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    const p = id == null ? Promise.resolve(null) : invoke('library:detail', { id })
    void p.then((next) => live && setD(next))
    return () => {
      live = false
    }
  }, [id, tick])
  // refetch when this asset changes (label/keywords/thumb)
  usePush(
    'assets:updated',
    (p) => {
      if (id != null && p.ids.includes(id)) setTick((t) => t + 1)
    },
    [id]
  )

  if (id == null || !d) {
    return (
      <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-line bg-bg-1">
        <div className="drag-region h-[52px] shrink-0" />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-fg-3">
          {selected.size > 1 ? `${selected.size} selected` : 'Select a photo'}
        </div>
        {selected.size > 1 && <BulkKeywords ids={[...selected]} />}
      </aside>
    )
  }
  const m = d.meta
  const many = selected.size > 1
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-line bg-bg-1">
      <div className="drag-region h-[52px] shrink-0" />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div
          className="mb-3 overflow-hidden rounded-[8px] bg-bg-2"
          style={{ aspectRatio: d.w && d.h ? `${d.w}/${d.h}` : '3/2' }}
        >
          {d.thumb === 1 && (
            <img
              src={thumbUrl(d.id, 1024)}
              alt=""
              className="tile-img h-full w-full object-cover"
            />
          )}
        </div>
        <div className="mb-1 truncate text-[13px] font-medium" title={d.name}>
          {d.name}
        </div>
        <div className="mb-3 truncate text-[11px] text-fg-3" title={d.dir}>
          {d.dir.split('/').slice(-2).join('/')}
        </div>

        <div className="mb-4 flex gap-1">
          <Action title="Reveal in Finder" onClick={() => void invoke('library:reveal', { id })}>
            <FolderOpen size={13} />
          </Action>
          <Action
            title="Open in default app"
            onClick={() => void invoke('library:openExternal', { id })}
          >
            <ExternalLink size={13} />
          </Action>
          <Action
            title="Find similar (S)"
            onClick={() =>
              setFilter({
                similarTo: id,
                text: undefined,
                color: undefined,
                duplicatesOnly: undefined
              })
            }
            disabled={!d.hasEmbedding && !d.dominant.length}
          >
            <Sparkles size={13} />
          </Action>
          <Action title="Duplicates (D)" onClick={() => setFilter({ duplicatesOnly: true })}>
            <Copy size={13} />
          </Action>
        </div>

        <Labels ids={many ? [...selected] : [id]} current={d.label} />

        <Keywords ids={many ? [...selected] : [id]} keywords={d.keywords} />

        {d.dominant.length > 0 && (
          <Block title="Colors">
            <div className="flex h-5 overflow-hidden rounded-[5px]">
              {d.dominant.map((c, i) => (
                <button
                  key={i}
                  title={`rgb(${c.r},${c.g},${c.b}) — filter by this color`}
                  onClick={() =>
                    setFilter({
                      color: `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
                    })
                  }
                  className="h-full transition-[flex] duration-200 hover:flex-[2]"
                  style={{ flex: c.weight, background: `rgb(${c.r},${c.g},${c.b})` }}
                />
              ))}
            </div>
          </Block>
        )}

        <Block title="Capture">
          <KV k="Taken" v={formatDate(d.takenAt)} />
          <KV k="Camera" v={m?.camera ?? '—'} />
          <KV k="Lens" v={m?.lens ?? '—'} />
          <KV
            k="Exposure"
            v={
              m
                ? `${m.focal ? `${m.focal}mm` : ''} ${m.aperture ? `ƒ/${m.aperture}` : ''} ${formatShutter(m.shutter)} ${m.iso ? `ISO ${m.iso}` : ''}`.trim() ||
                  '—'
                : '—'
            }
          />
          <KV k="Size" v={d.w && d.h ? `${d.w} × ${d.h}` : '—'} />
          {m?.lat != null && <KV k="GPS" v={`${m.lat.toFixed(4)}, ${m.lon?.toFixed(4)}`} />}
        </Block>

        <Block title="Files">
          {d.files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 py-[3px] text-[11.5px]"
            >
              <span className={cn('truncate', f.status !== 'ok' && 'text-fg-3 line-through')}>
                {f.path.split('/').pop()}
              </span>
              <span className="shrink-0 tabular-nums text-fg-3">{formatBytes(f.size)}</span>
            </div>
          ))}
        </Block>
      </div>
    </aside>
  )
}

function Labels({ ids, current }: { ids: number[]; current: number }): React.JSX.Element {
  return (
    <Block title="Label">
      <div className="flex items-center gap-1.5">
        {Object.entries(LABEL_COLORS).map(([k, c]) => {
          const l = Number(k)
          return (
            <button
              key={k}
              title={`${c.name} (${l === 5 ? 5 : l + 5})`}
              onClick={() => void invoke('tags:setLabel', { ids, label: current === l ? 0 : l })}
              className={cn(
                'h-5 w-5 rounded-full transition-transform duration-150 ease-spring hover:scale-110',
                current === l ? 'scale-110 ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'
              )}
              style={{ background: c.hex }}
            />
          )
        })}
        <button
          onClick={() => void invoke('tags:setLabel', { ids, label: 0 })}
          className="ml-1 text-[11px] text-fg-3 hover:text-fg"
          title="Clear (0)"
        >
          none
        </button>
      </div>
    </Block>
  )
}

function Keywords({ ids, keywords }: { ids: number[]; keywords: string[] }): React.JSX.Element {
  return (
    <Block title="Keywords">
      <div className="flex flex-wrap gap-1">
        {keywords.map((k) => (
          <span
            key={k}
            className="group flex h-[22px] items-center gap-1 rounded-full bg-white/[0.06] pl-2 pr-1 text-[11.5px]"
          >
            {k}
            <button
              onClick={() => void invoke('tags:removeKeyword', { ids, keyword: k })}
              className="flex h-4 w-4 items-center justify-center rounded-full text-fg-3 hover:bg-white/10 hover:text-fg"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <KeywordInput ids={ids} />
    </Block>
  )
}

function BulkKeywords({ ids }: { ids: number[] }): React.JSX.Element {
  return (
    <div className="px-4 pb-4">
      <Labels ids={ids} current={-1} />
      <Block title="Add keyword to all">
        <KeywordInput ids={ids} />
      </Block>
    </div>
  )
}

export function KeywordInput({ ids }: { ids: number[] }): React.JSX.Element {
  const [v, setV] = useState('')
  const [sugg, setSugg] = useState<Keyword[]>([])
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (e.key === 't' && !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const q = v.trim()
    let live = true
    void (q ? invoke('tags:keywords', { prefix: q }) : Promise.resolve([])).then(
      (r) => live && setSugg(r)
    )
    return () => {
      live = false
    }
  }, [v])
  const commit = (kw: string): void => {
    if (!kw.trim()) return
    void invoke('tags:addKeyword', { ids, keyword: kw.trim() })
    setV('')
    setSugg([])
  }
  return (
    <div className="relative mt-1.5">
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(v)
          if (e.key === 'Escape') {
            setV('')
            ref.current?.blur()
          }
        }}
        placeholder="Add keyword… (T)"
        className="h-[28px] w-full rounded-[6px] bg-white/[0.05] px-2 text-[12px] placeholder:text-fg-3 focus:bg-white/[0.07] focus:outline-none"
      />
      {sugg.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[6px] border border-line bg-bg-2 shadow-xl">
          {sugg.slice(0, 6).map((s) => (
            <button
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(s.name)
              }}
              className="flex w-full items-center justify-between px-2 py-1 text-left text-[12px] hover:bg-white/[0.06]"
            >
              {s.name}
              <span className="text-[10.5px] text-fg-3">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Block({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
        {title}
      </div>
      {children}
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3 py-[3px] text-[11.5px]">
      <span className="shrink-0 text-fg-3">{k}</span>
      <span className="truncate text-right" title={v}>
        {v}
      </span>
    </div>
  )
}

function Action({
  title,
  onClick,
  children,
  disabled
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 flex-1 items-center justify-center rounded-[6px] bg-white/[0.05] text-fg-2 transition-colors hover:bg-white/[0.09] hover:text-fg disabled:opacity-40 disabled:hover:bg-white/[0.05]"
    >
      {children}
    </button>
  )
}
