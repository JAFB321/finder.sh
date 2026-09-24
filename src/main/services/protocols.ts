import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { primaryPath } from '../db/assets'
import { thumbPath } from '../paths'
import type { IndexQueue } from '../indexer/queue'

const BROWSER_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

/** Must run before app.whenReady(). */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'thumb',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true
      }
    },
    {
      scheme: 'asset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

const notFound = (): Response => new Response('not found', { status: 404 })

/** thumb://a/<id>?s=256|1024|2560   asset://a/<id>  (best renderable representation of the primary file) */
export function installProtocols(queue: IndexQueue): void {
  protocol.handle('thumb', async (req) => {
    const url = new URL(req.url)
    const id = Number(url.pathname.split('/').filter(Boolean)[0])
    const size = Number(url.searchParams.get('s') ?? 256)
    const p = primaryPath(id)
    if (!p?.hash) return notFound()
    let file = thumbPath(p.hash, size)
    if (!existsSync(file)) {
      if (size >= 1024) {
        const made = await queue.ensureThumb(id, size as 1024 | 2560)
        if (!made) return notFound()
        file = made
      } else return notFound()
    }
    const res = await net.fetch(pathToFileURL(file).toString())
    return new Response(res.body, {
      headers: { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000, immutable' }
    })
  })

  protocol.handle('asset', async (req) => {
    const url = new URL(req.url)
    const id = Number(url.pathname.split('/').filter(Boolean)[0])
    const p = primaryPath(id)
    if (!p) return notFound()
    if (BROWSER_EXTS.has(p.ext) && existsSync(p.path))
      return net.fetch(pathToFileURL(p.path).toString())
    const big = await queue.ensureThumb(id, 2560)
    if (!big) return notFound()
    const res = await net.fetch(pathToFileURL(big).toString())
    return new Response(res.body, { headers: { 'content-type': 'image/webp' } })
  })
}
