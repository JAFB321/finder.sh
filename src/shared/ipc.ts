// IPC contract. Single source of truth for main <-> renderer communication.
// Add here first, then implement handler in src/main/ipc/*, then it is auto-typed in window.api.
import type {
  AssetDetail,
  AssetTile,
  Collection,
  DominantColor,
  IndexProgress,
  Keyword,
  LibraryFilter,
  Root
} from './types'

export interface FolderNode {
  path: string
  name: string
  count: number
  children: FolderNode[]
}

export interface DuplicateCluster {
  ids: number[]
}

/** request -> response. Renderer calls `api.invoke('name', arg)`. */
export interface Invoke {
  'roots:list': { arg: void; res: Root[] }
  'roots:add': { arg: { path?: string }; res: Root | null }
  'roots:remove': { arg: { id: number }; res: void }
  'roots:rescan': { arg: { id?: number }; res: void }
  'roots:folders': { arg: { rootId: number }; res: FolderNode }

  'library:query': {
    arg: { filter: LibraryFilter; offset: number; limit: number }
    res: { total: number; items: AssetTile[] }
  }
  'library:ids': { arg: { filter: LibraryFilter }; res: number[] }
  'library:tiles': { arg: { ids: number[] }; res: AssetTile[] }
  'library:detail': { arg: { id: number }; res: AssetDetail | null }
  'library:viewport': { arg: { ids: number[] }; res: void }
  'library:duplicates': { arg: { filter: LibraryFilter }; res: DuplicateCluster[] }
  'library:reveal': { arg: { id: number }; res: void }
  'library:openExternal': { arg: { id: number }; res: void }

  'tags:setLabel': { arg: { ids: number[]; label: number }; res: void }
  'tags:keywords': { arg: { prefix?: string }; res: Keyword[] }
  'tags:addKeyword': { arg: { ids: number[]; keyword: string }; res: void }
  'tags:removeKeyword': { arg: { ids: number[]; keyword: string }; res: void }

  'collections:list': { arg: void; res: Collection[] }
  'collections:create': { arg: { name: string; smartFilter?: LibraryFilter }; res: Collection }
  'collections:rename': { arg: { id: number; name: string }; res: void }
  'collections:delete': { arg: { id: number }; res: void }
  'collections:add': { arg: { id: number; assetIds: number[] }; res: void }
  'collections:remove': { arg: { id: number; assetIds: number[] }; res: void }

  'index:progress': { arg: void; res: IndexProgress }
  'index:pause': { arg: { paused: boolean }; res: void }

  'colors:palette': { arg: { filter: LibraryFilter }; res: DominantColor[] }

  'app:paths': { arg: void; res: { data: string; cache: string; db: string } }
}

/** main -> renderer push events. Renderer subscribes with `api.on('name', cb)`. */
export interface Push {
  'index:progress': IndexProgress
  /** assets whose tile data changed (thumb ready, meta ready, label). Renderer patches its cache. */
  'assets:updated': { ids: number[] }
  /** new assets appeared or were removed; renderer should refetch current query */
  'library:changed': { rootId: number | null }
  'roots:changed': void
  'model:download': { name: string; progress: number; done: boolean; error?: string }
}

export type InvokeName = keyof Invoke
export type PushName = keyof Push

export interface Api {
  invoke<K extends InvokeName>(name: K, arg: Invoke[K]['arg']): Promise<Invoke[K]['res']>
  on<K extends PushName>(name: K, cb: (payload: Push[K]) => void): () => void
}
