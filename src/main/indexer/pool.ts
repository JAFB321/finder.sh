import { Worker } from 'worker_threads'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  worker: Slot
}

interface Slot {
  worker: Worker
  inflight: number
}

export interface WorkerMessage {
  id: number
  ok: boolean
  result?: unknown
  error?: string
  /** free-form progress/event from worker (e.g. model download) */
  event?: { type: string; [k: string]: unknown }
}

/**
 * Minimal worker_threads pool. Each task is a JSON-able request; worker replies {id, ok, result|error}.
 * `perWorker` allows overlapping I/O-bound tasks on the same thread.
 */
export class WorkerPool {
  private slots: Slot[] = []
  private pending = new Map<number, Pending>()
  private seq = 0
  onEvent?: (e: NonNullable<WorkerMessage['event']>) => void

  constructor(
    private file: string,
    private size: number,
    private perWorker = 2,
    private workerData: Record<string, unknown> = {}
  ) {}

  start(): void {
    for (let i = 0; i < this.size; i++) this.spawn()
  }

  private spawn(): void {
    const worker = new Worker(this.file, { workerData: this.workerData })
    const slot: Slot = { worker, inflight: 0 }
    worker.on('message', (m: WorkerMessage) => {
      if (m.event) {
        this.onEvent?.(m.event)
        return
      }
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      slot.inflight--
      if (m.ok) p.resolve(m.result)
      else p.reject(new Error(m.error ?? 'worker error'))
    })
    worker.on('error', (err) => {
      for (const [id, p] of this.pending) {
        if (p.worker === slot) {
          this.pending.delete(id)
          p.reject(err)
        }
      }
      this.slots = this.slots.filter((s) => s !== slot)
      // respawn after a crash
      setTimeout(() => this.spawn(), 500)
    })
    this.slots.push(slot)
  }

  get capacity(): number {
    return this.slots.reduce((n, s) => n + Math.max(0, this.perWorker - s.inflight), 0)
  }

  run<T>(req: Record<string, unknown>): Promise<T> {
    const slot = this.slots.reduce(
      (best, s) => (s.inflight < best.inflight ? s : best),
      this.slots[0]
    )
    if (!slot) return Promise.reject(new Error('pool not started'))
    const id = ++this.seq
    slot.inflight++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, worker: slot })
      slot.worker.postMessage({ id, ...req })
    })
  }

  async stop(): Promise<void> {
    await Promise.all(this.slots.map((s) => s.worker.terminate()))
    this.slots = []
  }
}
