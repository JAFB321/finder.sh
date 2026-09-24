import { cpus } from 'os'
import { join } from 'path'
import type { AssetMeta, DominantColor, IndexProgress, JobKind } from '@shared/types'
import { WorkerPool } from './pool'
import * as jobs from '../db/jobs'
import * as assets from '../db/assets'
import { paths, thumbPath } from '../paths'
import { isScanning } from './scanner'
import { existsSync } from 'fs'

export interface QueueEvents {
  onAssetsUpdated: (ids: number[]) => void
  onProgress: (p: IndexProgress) => void
  onModelEvent: (e: { name: string; progress: number; done: boolean; error?: string }) => void
}

interface MetaResult {
  meta: AssetMeta
  hash: string
}
interface ThumbResult {
  width: number
  height: number
}
interface VisualResult {
  phash: string
  dominant: DominantColor[]
}

/**
 * Pulls jobs from the DB queue and dispatches to worker pools. Single instance.
 * Ordering per asset: meta -> thumb -> (visual, embed).
 */
export class IndexQueue {
  private pool: WorkerPool
  private embedPool: WorkerPool
  private running = false
  private paused = false
  private tick: NodeJS.Timeout | null = null
  private updated = new Set<number>()
  private flushTimer: NodeJS.Timeout | null = null
  private doneWindow: number[] = []
  private lastScanned = 0

  constructor(private ev: QueueEvents) {
    const n = Math.max(2, cpus().length - 2)
    this.pool = new WorkerPool(join(__dirname, 'workers/indexer.js'), n, 2, {
      thumbsDir: paths.thumbs
    })
    this.embedPool = new WorkerPool(join(__dirname, 'workers/embed.js'), 1, 4, {
      modelsDir: paths.models
    })
    this.embedPool.onEvent = (e) => {
      if (e.type === 'model') {
        const done = !!e.done
        this.ev.onModelEvent({
          name: String(e.name),
          progress: Number(e.progress ?? 0),
          done,
          error: e.error as string | undefined
        })
      }
    }
  }

  start(): void {
    jobs.resetRunning()
    this.pool.start()
    this.embedPool.start()
    this.running = true
    this.loop()
    this.tick = setInterval(() => this.ev.onProgress(this.progress()), 700)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.tick) clearInterval(this.tick)
    await Promise.all([this.pool.stop(), this.embedPool.stop()])
  }

  setPaused(p: boolean): void {
    this.paused = p
    if (!p) this.loop()
  }

  setScanned(n: number): void {
    this.lastScanned = n
  }

  /** Wake the loop (new jobs enqueued). */
  poke(): void {
    this.loop()
  }

  progress(): IndexProgress {
    const c = jobs.counts()
    const cutoff = Date.now() - 5000
    this.doneWindow = this.doneWindow.filter((t) => t > cutoff)
    return {
      scanning: isScanning(),
      scanned: this.lastScanned,
      ...c,
      rate: this.doneWindow.length / 5
    }
  }

  async embedText(text: string): Promise<Float32Array | null> {
    try {
      const r = await this.embedPool.run<{ embedding: number[] }>({ kind: 'text', text })
      return Float32Array.from(r.embedding)
    } catch {
      return null
    }
  }

  /** Generate (if needed) and return the path of a large thumb. */
  async ensureThumb(assetId: number, size: 1024 | 2560): Promise<string | null> {
    const p = assets.primaryPath(assetId)
    if (!p?.hash) return null
    const out = thumbPath(p.hash, size)
    if (existsSync(out)) return out
    try {
      await this.pool.run({
        kind: 'thumb',
        assetId,
        path: p.path,
        ext: p.ext,
        isRaw: p.isRaw,
        hash: p.hash,
        sizes: [size],
        orientation: orientationOf(assetId)
      })
      return existsSync(out) ? out : null
    } catch {
      return null
    }
  }

  private looping = false
  private async loop(): Promise<void> {
    if (this.looping || !this.running || this.paused) return
    this.looping = true
    try {
      let didWork = true
      while (didWork && this.running && !this.paused) {
        didWork = false
        for (const kind of ['meta', 'thumb', 'visual'] as JobKind[]) {
          const cap = this.pool.capacity
          if (cap <= 0) break
          const ids = jobs.claim(kind, cap)
          if (!ids.length) continue
          didWork = true
          for (const id of ids) void this.dispatch(kind, id)
        }
        {
          const cap = this.embedPool.capacity
          if (cap > 0) {
            const ids = jobs.claim('embed', cap)
            if (ids.length) {
              didWork = true
              for (const id of ids) void this.dispatch('embed', id)
            }
          }
        }
        if (!didWork) break
        // allow in-flight tasks to complete before claiming more
        await new Promise((r) => setTimeout(r, 30))
      }
    } finally {
      this.looping = false
    }
  }

  private async dispatch(kind: JobKind, assetId: number): Promise<void> {
    const p = assets.primaryPath(assetId)
    if (!p) {
      jobs.complete(assetId, kind, 'no primary file')
      return
    }
    try {
      switch (kind) {
        case 'meta': {
          const r = await this.pool.run<MetaResult>({
            kind,
            assetId,
            path: p.path,
            ext: p.ext,
            isRaw: p.isRaw
          })
          assets.writeMeta(assetId, r.meta, r.hash)
          break
        }
        case 'thumb': {
          const hash = p.hash ?? assets.primaryPath(assetId)?.hash
          if (!hash) throw new Error('no hash')
          const r = await this.pool.run<ThumbResult>({
            kind,
            assetId,
            path: p.path,
            ext: p.ext,
            isRaw: p.isRaw,
            hash,
            sizes: [1024, 256],
            orientation: orientationOf(assetId)
          })
          assets.writeThumbState(assetId, 1, r.width, r.height)
          break
        }
        case 'visual': {
          if (!p.hash) throw new Error('no hash')
          const r = await this.pool.run<VisualResult>({
            kind,
            assetId,
            thumb: thumbPath(p.hash, 256)
          })
          assets.writeVisual(assetId, BigInt(r.phash), r.dominant)
          break
        }
        case 'embed': {
          if (!p.hash) throw new Error('no hash')
          const r = await this.embedPool.run<{ embedding: number[] }>({
            kind: 'image',
            thumb: thumbPath(p.hash, 1024)
          })
          assets.writeEmbedding(assetId, Float32Array.from(r.embedding))
          break
        }
      }
      jobs.complete(assetId, kind)
      this.doneWindow.push(Date.now())
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      jobs.complete(assetId, kind, msg)
      if (kind === 'thumb') assets.writeThumbState(assetId, -1)
    }
    this.markUpdated(assetId)
    this.loop()
  }

  private markUpdated(id: number): void {
    this.updated.add(id)
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        const ids = [...this.updated]
        this.updated.clear()
        if (ids.length) this.ev.onAssetsUpdated(ids)
      }, 250)
    }
  }
}

function orientationOf(assetId: number): number {
  const d = assets.detail(assetId)
  return d?.meta?.orientation ?? 1
}
