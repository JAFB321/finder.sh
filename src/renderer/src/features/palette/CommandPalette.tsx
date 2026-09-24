import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import type { Collection } from '@shared/types'
import { invoke } from '@renderer/lib/api'
import { useLibrary } from '../library/store'

/** ⌘K: collections, layouts, quick actions. */
export function CommandPalette(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const selected = useLibrary((s) => s.selected)
  const setLayout = useLibrary((s) => s.setLayout)
  const setFilter = useLibrary((s) => s.setFilter)
  const filter = useLibrary((s) => s.filter)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) void invoke('collections:list', undefined).then(setCollections)
  }, [open])

  const run = (fn: () => void | Promise<unknown>): void => {
    setOpen(false)
    void fn()
  }
  const sel = [...selected]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-in_120ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-[12px] border border-line bg-bg-2 shadow-2xl outline-none data-[state=open]:animate-[fade-in_120ms_ease-out]">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Commands" loop>
            <Command.Input
              autoFocus
              placeholder="Type a command…"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] placeholder:text-fg-3 focus:outline-none"
            />
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-3">
              <Command.Empty className="px-3 py-6 text-center text-[12px] text-fg-3">
                No results.
              </Command.Empty>
              {sel.length > 0 && (
                <Command.Group heading={`Selection (${sel.length})`}>
                  {collections
                    .filter((c) => !c.smartFilter)
                    .map((c) => (
                      <Item
                        key={c.id}
                        onSelect={() =>
                          run(() => invoke('collections:add', { id: c.id, assetIds: sel }))
                        }
                      >
                        Add to “{c.name}”
                      </Item>
                    ))}
                  <Item
                    onSelect={() =>
                      run(async () => {
                        const name = prompt('New collection name')
                        if (!name) return
                        const c = await invoke('collections:create', { name })
                        await invoke('collections:add', { id: c.id, assetIds: sel })
                      })
                    }
                  >
                    New collection from selection…
                  </Item>
                  {filter.collectionId && (
                    <Item
                      onSelect={() =>
                        run(() =>
                          invoke('collections:remove', { id: filter.collectionId!, assetIds: sel })
                        )
                      }
                    >
                      Remove from this collection
                    </Item>
                  )}
                  <Item onSelect={() => run(() => invoke('library:reveal', { id: sel[0] }))}>
                    Reveal in Finder
                  </Item>
                </Command.Group>
              )}
              <Command.Group heading="Collections">
                <Item
                  onSelect={() =>
                    run(async () => {
                      const name = prompt('Smart collection name (saves current filters)')
                      if (name) await invoke('collections:create', { name, smartFilter: filter })
                    })
                  }
                >
                  Save current filters as smart collection…
                </Item>
                {collections.map((c) => (
                  <Item
                    key={c.id}
                    onSelect={() =>
                      run(() =>
                        c.smartFilter
                          ? setFilter(() => ({ ...c.smartFilter! }))
                          : setFilter({ collectionId: c.id, rootId: undefined, dir: undefined })
                      )
                    }
                  >
                    Open “{c.name}”{c.smartFilter ? ' (smart)' : ''}
                  </Item>
                ))}
                {filter.collectionId && (
                  <Item
                    onSelect={() =>
                      run(async () => {
                        if (confirm('Delete this collection? Photos are not affected.')) {
                          await invoke('collections:delete', { id: filter.collectionId! })
                          setFilter({ collectionId: undefined })
                        }
                      })
                    }
                  >
                    Delete current collection
                  </Item>
                )}
              </Command.Group>
              <Command.Group heading="View">
                <Item onSelect={() => run(() => setLayout('justified'))}>Layout: Justified</Item>
                <Item onSelect={() => run(() => setLayout('grid'))}>Layout: Grid</Item>
                <Item onSelect={() => run(() => setLayout('masonry'))}>Layout: Masonry</Item>
                <Item onSelect={() => run(() => setLayout('filmstrip'))}>Layout: Filmstrip</Item>
                <Item onSelect={() => run(() => setFilter({ sort: 'random' }))}>Shuffle</Item>
                <Item onSelect={() => run(() => setFilter({ sort: 'takenAt', sortDir: 'desc' }))}>
                  Sort: newest first
                </Item>
                <Item onSelect={() => run(() => setFilter({ sort: 'takenAt', sortDir: 'asc' }))}>
                  Sort: oldest first
                </Item>
                <Item
                  onSelect={() =>
                    run(() => setFilter({ includeOffline: !filter.includeOffline || undefined }))
                  }
                >
                  {filter.includeOffline ? 'Hide' : 'Show'} offline / missing
                </Item>
              </Command.Group>
              <Command.Group heading="Library">
                <Item onSelect={() => run(() => invoke('roots:add', {}))}>Add folder…</Item>
                <Item onSelect={() => run(() => invoke('roots:rescan', {}))}>
                  Rescan all folders
                </Item>
                <Item
                  onSelect={() =>
                    run(async () => {
                      const p = await invoke('app:paths', undefined)
                      alert(`Data: ${p.data}\nDB: ${p.db}`)
                    })
                  }
                >
                  Show data location
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Item({
  children,
  onSelect
}: {
  children: React.ReactNode
  onSelect: () => void
}): React.JSX.Element {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center rounded-[7px] px-2.5 text-[13px] text-fg-2 data-[selected=true]:bg-white/[0.07] data-[selected=true]:text-fg"
    >
      {children}
    </Command.Item>
  )
}
