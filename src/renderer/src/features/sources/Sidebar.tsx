import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, FolderPlus, HardDrive, Layers, RefreshCw, Trash2, Copy } from 'lucide-react'
import type { Collection, IndexProgress, Root } from '@shared/types'
import type { FolderNode } from '@shared/ipc'
import { invoke, usePush } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useLibrary } from '../library/store'

export function Sidebar(): React.JSX.Element {
  const [roots, setRoots] = useState<Root[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    void Promise.all([invoke('roots:list', undefined), invoke('collections:list', undefined)]).then(
      ([r, c]) => {
        if (!live) return
        setRoots(r)
        setCollections(c)
      }
    )
    return () => {
      live = false
    }
  }, [tick])
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  usePush('roots:changed', refresh, [refresh])
  usePush('library:changed', refresh, [refresh])

  const allActive = !filter.rootId && !filter.dir && !filter.collectionId && !filter.duplicatesOnly

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-line bg-bg-1">
      <div className="drag-region h-[52px] shrink-0" />
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <Section title="Library">
          <Row
            active={allActive}
            icon={<Layers size={14} />}
            label="All photos"
            onClick={() =>
              setFilter({
                rootId: undefined,
                dir: undefined,
                collectionId: undefined,
                duplicatesOnly: undefined,
                similarTo: undefined
              })
            }
          />
          <Row
            active={!!filter.duplicatesOnly}
            icon={<Copy size={14} />}
            label="Duplicates"
            onClick={() =>
              setFilter({
                duplicatesOnly: !filter.duplicatesOnly || undefined,
                similarTo: undefined
              })
            }
          />
        </Section>
        <Section
          title="Folders"
          action={
            <IconBtn title="Add folder" onClick={() => void invoke('roots:add', {})}>
              <FolderPlus size={14} />
            </IconBtn>
          }
        >
          {roots.map((r) => (
            <RootItem key={r.id} root={r} />
          ))}
          {!roots.length && <div className="px-2 py-1 text-[12px] text-fg-3">No folders yet.</div>}
        </Section>
        <Section title="Collections">
          {collections.map((c) => (
            <Row
              key={c.id}
              active={filter.collectionId === c.id}
              icon={<span className="h-[7px] w-[7px] rounded-full bg-accent/70" />}
              label={c.name}
              count={c.count}
              onClick={() => setFilter({ collectionId: c.id, rootId: undefined, dir: undefined })}
            />
          ))}
          {!collections.length && (
            <div className="px-2 py-1 text-[12px] text-fg-3">
              Select photos, then ⌘K → “Add to collection”.
            </div>
          )}
        </Section>
      </div>
      <Progress />
    </aside>
  )
}

function RootItem({ root }: { root: Root }): React.JSX.Element {
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const [open, setOpen] = useState(false)
  const [tree, setTree] = useState<FolderNode | null>(null)
  useEffect(() => {
    if (open) void invoke('roots:folders', { rootId: root.id }).then(setTree)
  }, [open, root.id, root.fileCount])
  const active = filter.rootId === root.id && !filter.dir
  return (
    <div>
      <div
        className={cn(
          'group flex h-[26px] items-center gap-1 rounded-[5px] pl-1 pr-1 text-[12.5px] hover:bg-white/[0.04]',
          active && 'bg-white/[0.07] text-fg'
        )}
      >
        <button
          className="flex h-4 w-4 items-center justify-center text-fg-3 hover:text-fg"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight
            size={12}
            className={cn('transition-transform duration-150', open && 'rotate-90')}
          />
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setFilter({ rootId: root.id, dir: undefined, collectionId: undefined })}
        >
          <HardDrive
            size={13}
            className={cn('shrink-0', root.online ? 'text-fg-2' : 'text-fg-3')}
          />
          <span
            className={cn('truncate', !root.online && 'text-fg-3 line-through decoration-fg-3/50')}
          >
            {root.name}
          </span>
        </button>
        <span className="text-[11px] tabular-nums text-fg-3">{root.fileCount}</span>
        <div className="hidden gap-0.5 group-hover:flex">
          <IconBtn title="Rescan" onClick={() => void invoke('roots:rescan', { id: root.id })}>
            <RefreshCw size={12} />
          </IconBtn>
          <IconBtn
            title="Remove"
            onClick={() =>
              confirm(`Remove "${root.name}" from the library? Files are not touched.`) &&
              void invoke('roots:remove', { id: root.id })
            }
          >
            <Trash2 size={12} />
          </IconBtn>
        </div>
      </div>
      {open && tree && (
        <div className="ml-3 border-l border-line pl-1">
          {tree.children.map((c) => (
            <FolderRow key={c.path} node={c} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function FolderRow({ node, depth }: { node: FolderNode; depth: number }): React.JSX.Element {
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const [open, setOpen] = useState(false)
  const active = filter.dir === node.path
  const has = node.children.length > 0
  return (
    <div>
      <div
        className={cn(
          'flex h-[24px] items-center gap-1 rounded-[5px] pr-1 text-[12px] hover:bg-white/[0.04]',
          active && 'bg-white/[0.07] text-fg'
        )}
        style={{ paddingLeft: depth * 10 + 2 }}
      >
        <button
          className={cn(
            'flex h-4 w-4 items-center justify-center text-fg-3 hover:text-fg',
            !has && 'invisible'
          )}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight
            size={11}
            className={cn('transition-transform duration-150', open && 'rotate-90')}
          />
        </button>
        <button
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => setFilter({ dir: node.path, rootId: undefined, collectionId: undefined })}
        >
          {node.name}
        </button>
        <span className="text-[10.5px] tabular-nums text-fg-3">{node.count}</span>
      </div>
      {open && node.children.map((c) => <FolderRow key={c.path} node={c} depth={depth + 1} />)}
    </div>
  )
}

function Progress(): React.JSX.Element | null {
  const [p, setP] = useState<IndexProgress | null>(null)
  const [model, setModel] = useState<{ progress: number; done: boolean; error?: string } | null>(
    null
  )
  usePush('index:progress', setP)
  usePush('model:download', (m) => setModel(m))
  useEffect(() => void invoke('index:progress', undefined).then(setP), [])
  if (!p) return null
  const pending = Object.values(p.pending).reduce((a, b) => a + b, 0)
  const done = Object.values(p.done).reduce((a, b) => a + b, 0)
  const total = pending + done
  const busy = p.scanning || pending > 0
  const modelBusy = model && !model.done
  if (!busy && !modelBusy) return null
  return (
    <div className="border-t border-line px-3 py-2 text-[11px] text-fg-2">
      {p.scanning && (
        <div className="mb-1 flex justify-between">
          <span>Scanning…</span>
          <span className="tabular-nums text-fg-3">{p.scanned}</span>
        </div>
      )}
      {pending > 0 && (
        <>
          <div className="flex justify-between">
            <span>Indexing</span>
            <span className="tabular-nums text-fg-3">
              {done}/{total} · {p.rate.toFixed(0)}/s
            </span>
          </div>
          <div className="mt-1 h-[3px] overflow-hidden rounded bg-white/[0.06]">
            <div
              className="h-full rounded bg-accent transition-[width] duration-500"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1 flex gap-2 text-[10px] text-fg-3">
            <span>meta {p.pending.meta}</span>
            <span>thumb {p.pending.thumb}</span>
            <span>visual {p.pending.visual}</span>
            <span>ai {p.pending.embed}</span>
          </div>
        </>
      )}
      {modelBusy && (
        <div className="mt-1 flex justify-between">
          <span>Downloading AI model</span>
          <span className="tabular-nums text-fg-3">
            {model.error ? 'failed' : `${model.progress}%`}
          </span>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-3">
      <div className="flex h-6 items-center justify-between px-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({
  active,
  icon,
  label,
  count,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[26px] w-full items-center gap-2 rounded-[5px] px-2 text-left text-[12.5px] text-fg-2 hover:bg-white/[0.04] hover:text-fg',
        active && 'bg-white/[0.07] text-fg'
      )}
    >
      <span className="flex w-4 justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="text-[11px] tabular-nums text-fg-3">{count}</span>}
    </button>
  )
}

export function IconBtn({
  title,
  onClick,
  children,
  active
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-[5px] text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg',
        active && 'bg-white/[0.09] text-fg'
      )}
    >
      {children}
    </button>
  )
}
