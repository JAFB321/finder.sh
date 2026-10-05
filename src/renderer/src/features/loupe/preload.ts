// Tiny LRU of decoded images so loupe navigation never shows an empty frame.

interface Entry {
  img: HTMLImageElement
  promise: Promise<HTMLImageElement>
  ready: boolean
}

const MAX = 12 // ~6 assets × (1024 thumb + hi-res)
const cache = new Map<string, Entry>()

/** Load + decode `url`, reusing an in-flight or finished load. Rejects on error. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = cache.get(url)
  if (hit) {
    cache.delete(url)
    cache.set(url, hit)
    return hit.promise
  }
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  const entry: Entry = {
    img,
    ready: false,
    promise: img.decode().then(
      () => {
        entry.ready = true
        return img
      },
      (err: unknown) => {
        cache.delete(url)
        throw err
      }
    )
  }
  // swallow here; callers attach their own handlers
  entry.promise.catch(() => {})
  cache.set(url, entry)
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value as string
    cache.delete(oldest)
  }
  return entry.promise
}

/** The decoded image for `url`, if already in the cache. */
export function readyImage(url: string): HTMLImageElement | null {
  const e = cache.get(url)
  return e?.ready ? e.img : null
}
