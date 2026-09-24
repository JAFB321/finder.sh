import { dialog, shell } from 'electron'
import type { LibraryFilter } from '@shared/types'
import type { FolderNode } from '@shared/ipc'
import { handle, push } from './index'
import * as roots from '../db/roots'
import * as assets from '../db/assets'
import * as tags from '../db/tags'
import * as jobs from '../db/jobs'
import { scanRoot } from '../indexer/scanner'
import type { IndexQueue } from '../indexer/queue'
import { paths } from '../paths'

/** Small cache: filter JSON -> ordered ids. Invalidated on library changes. */
const idCache = new Map<string, number[]>()
export function invalidateIds(): void {
  idCache.clear()
}

async function idsFor(filter: LibraryFilter, queue: IndexQueue): Promise<number[]> {
  const key = JSON.stringify(filter)
  const hit = idCache.get(key)
  if (hit) return hit
  let textEmb: Float32Array | null = null
  if (filter.text?.trim() && !filter.similarTo) textEmb = await queue.embedText(filter.text.trim())
  const ids = assets.resolveIds(filter, textEmb)
  idCache.set(key, ids)
  if (idCache.size > 20) idCache.delete(idCache.keys().next().value!)
  return ids
}

export function registerHandlers(queue: IndexQueue): void {
  const rescan = (id: number): void => {
    void scanRoot(id, {
      onBatch: (rootId, _ids, scanned) => {
        queue.setScanned(scanned)
        invalidateIds()
        push('library:changed', { rootId })
        queue.poke()
      },
      onDone: (rootId) => {
        invalidateIds()
        push('library:changed', { rootId })
        push('roots:changed', undefined)
        queue.poke()
      }
    })
  }

  handle('roots:list', () => roots.listRoots())
  handle('roots:add', async ({ path }) => {
    const p = path
    if (!p) {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
      if (r.canceled || !r.filePaths.length) return null
      let last: ReturnType<typeof roots.addRoot> | null = null
      for (const fp of r.filePaths) {
        last = roots.addRoot(fp)
        rescan(last.id)
      }
      push('roots:changed', undefined)
      return last
    }
    const root = roots.addRoot(p)
    rescan(root.id)
    push('roots:changed', undefined)
    return root
  })
  handle('roots:remove', ({ id }) => {
    roots.removeRoot(id)
    invalidateIds()
    push('roots:changed', undefined)
    push('library:changed', { rootId: null })
  })
  handle('roots:rescan', ({ id }) => {
    const list = id ? [id] : roots.listRoots().map((r) => r.id)
    for (const r of list) rescan(r)
  })
  handle('roots:folders', ({ rootId }) => {
    const root = roots.getRoot(rootId)
    const node: FolderNode = {
      path: root?.path ?? '',
      name: root?.name ?? '',
      count: 0,
      children: []
    }
    if (!root) return node
    const rows = assets.folderTree(rootId)
    const byPath = new Map<string, FolderNode>([[root.path, node]])
    for (const r of rows) {
      // ensure every ancestor exists
      const rel = r.path.slice(root.path.length).split('/').filter(Boolean)
      let cur = node
      let acc = root.path
      for (const seg of rel) {
        acc += '/' + seg
        let child = byPath.get(acc)
        if (!child) {
          child = { path: acc, name: seg, count: 0, children: [] }
          byPath.set(acc, child)
          cur.children.push(child)
        }
        cur = child
      }
      cur.count += r.count
    }
    // roll up counts and sort
    const roll = (n: FolderNode): number => {
      n.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      for (const c of n.children) n.count += roll(c)
      return n.count
    }
    roll(node)
    return node
  })

  handle('library:query', async ({ filter, offset, limit }) => {
    const ids = await idsFor(filter, queue)
    return { total: ids.length, items: assets.tilesByIds(ids.slice(offset, offset + limit)) }
  })
  handle('library:ids', ({ filter }) => idsFor(filter, queue))
  handle('library:tiles', ({ ids }) => assets.tilesByIds(ids))
  handle('library:detail', ({ id }) => assets.detail(id))
  handle('library:viewport', ({ ids }) => {
    jobs.bumpPriority(ids, 100)
    queue.poke()
  })
  handle('library:duplicates', async ({ filter }) =>
    assets.duplicatesFor(await idsFor(filter, queue)).map((ids) => ({ ids }))
  )
  handle('library:reveal', ({ id }) => {
    const p = assets.primaryPath(id)
    if (p) shell.showItemInFolder(p.path)
  })
  handle('library:openExternal', async ({ id }) => {
    const p = assets.primaryPath(id)
    if (p) await shell.openPath(p.path)
  })

  handle('tags:setLabel', ({ ids, label }) => {
    tags.setLabel(ids, label)
    invalidateIds()
    push('assets:updated', { ids })
  })
  handle('tags:keywords', ({ prefix }) => tags.listKeywords(prefix))
  handle('tags:addKeyword', ({ ids, keyword }) => {
    tags.addKeyword(ids, keyword)
    invalidateIds()
    push('assets:updated', { ids })
  })
  handle('tags:removeKeyword', ({ ids, keyword }) => {
    tags.removeKeyword(ids, keyword)
    invalidateIds()
    push('assets:updated', { ids })
  })

  handle('collections:list', () => tags.listCollections())
  handle('collections:create', ({ name, smartFilter }) => tags.createCollection(name, smartFilter))
  handle('collections:rename', ({ id, name }) => tags.renameCollection(id, name))
  handle('collections:delete', ({ id }) => {
    tags.deleteCollection(id)
    invalidateIds()
  })
  handle('collections:add', ({ id, assetIds }) => {
    tags.addToCollection(id, assetIds)
    invalidateIds()
    push('library:changed', { rootId: null })
  })
  handle('collections:remove', ({ id, assetIds }) => {
    tags.removeFromCollection(id, assetIds)
    invalidateIds()
    push('library:changed', { rootId: null })
  })

  handle('index:progress', () => queue.progress())
  handle('index:pause', ({ paused }) => queue.setPaused(paused))

  handle('colors:palette', async ({ filter }) => assets.paletteFor(await idsFor(filter, queue)))

  handle('app:paths', () => ({ data: paths.base, cache: paths.cache, db: paths.db }))
}
