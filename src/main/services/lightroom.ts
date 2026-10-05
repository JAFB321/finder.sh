import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const APP_NAMES = ['Adobe Lightroom Classic', 'Adobe Lightroom']

let cached: string | null | undefined

/** Absolute path of the installed Lightroom bundle, or null. Cached for the session. */
export function lightroomApp(): string | null {
  if (cached !== undefined) return cached
  cached = null
  if (process.platform !== 'darwin') return cached
  const dirs = ['/Applications', join(homedir(), 'Applications')]
  for (const name of APP_NAMES) {
    for (const dir of dirs) {
      // Adobe installers put the bundle inside a same-named folder; older ones put it at top level.
      for (const p of [join(dir, name, `${name}.app`), join(dir, `${name}.app`)]) {
        if (existsSync(p)) return (cached = p)
      }
    }
  }
  return cached
}

/** Hand files or folders to Lightroom (it shows its Import dialog). */
export function openInLightroom(paths: string[]): Promise<void> {
  const app = lightroomApp()
  if (!app || !paths.length) return Promise.resolve()
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', app, ...paths], (err) => (err ? reject(err) : resolve()))
  })
}
