import { watch, type FSWatcher } from 'chokidar'
import { readdirSync } from 'fs'
import { listRoots } from '../db/roots'

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null
let volumePoll: NodeJS.Timeout | null = null

/**
 * Watches all online roots; any change debounces into a full (incremental) rescan.
 * External drives: /Volumes is polled (never watched recursively — "Macintosh HD" links to /).
 */
export function startWatcher(onChange: () => void): void {
  stopWatcher()
  const roots = listRoots().filter((r) => r.online)
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 4000)
  }
  if (roots.length) {
    watcher = watch(
      roots.map((r) => r.path),
      {
        ignoreInitial: true,
        ignored: (p: string) => /(^|\/)\.[^/]/.test(p),
        awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
        depth: 32
      }
    )
    watcher.on('error', () => {})
    watcher
      .on('add', schedule)
      .on('unlink', schedule)
      .on('change', schedule)
      .on('addDir', schedule)
      .on('unlinkDir', schedule)
  }
  if (process.platform === 'darwin') {
    let last = volumes()
    volumePoll = setInterval(() => {
      const now = volumes()
      if (now !== last) {
        last = now
        schedule()
      }
    }, 10_000)
  }
}

function volumes(): string {
  try {
    return readdirSync('/Volumes').sort().join('|')
  } catch {
    return ''
  }
}

export function stopWatcher(): void {
  void watcher?.close()
  watcher = null
  if (timer) clearTimeout(timer)
  timer = null
  if (volumePoll) clearInterval(volumePoll)
  volumePoll = null
}
