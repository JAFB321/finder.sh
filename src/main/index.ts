import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ensureDirs } from './paths'
import { getDb, closeDb } from './db'
import { IndexQueue } from './indexer/queue'
import { registerSchemes, installProtocols } from './services/protocols'
import { registerHandlers, invalidateIds } from './ipc/handlers'
import { push } from './ipc'
import { addRoot, listRoots } from './db/roots'
import { startWatcher, stopWatcher } from './services/watcher'
import { scanRoot } from './indexer/scanner'

registerSchemes()

let queue: IndexQueue | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win.show())
  // Relay renderer console + crashes to stdout so headless runs (and `pnpm dev` logs) show UI errors.
  win.webContents.on('console-message', (ev) => {
    if (ev.level === 'error' || ev.level === 'warning' || process.env.THEFINDER_VERBOSE)
      console.log(`[renderer:${ev.level}] ${ev.message} (${ev.sourceId}:${ev.lineNumber})`)
  })
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason))
  win.webContents.on('did-fail-load', (_e, code, desc) =>
    console.error('[renderer load failed]', code, desc)
  )
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.jafb321.thefinder')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ensureDirs()
  getDb()

  queue = new IndexQueue({
    onAssetsUpdated: (ids) => {
      invalidateIds()
      push('assets:updated', { ids })
    },
    onProgress: (p) => push('index:progress', p),
    onModelEvent: (e) => push('model:download', e)
  })
  installProtocols(queue)
  registerHandlers(queue)
  queue.start()

  const win = createWindow()

  // Dev/automation hooks: `--add-root <path>` registers a folder; THEFINDER_SCREENSHOT=<png> captures the window after load.
  const argIdx = process.argv.indexOf('--add-root')
  if (argIdx > 0 && process.argv[argIdx + 1]) {
    addRoot(process.argv[argIdx + 1])
  }
  if (process.env.THEFINDER_SCREENSHOT) {
    const delay = Number(process.env.THEFINDER_SCREENSHOT_DELAY ?? 8000)
    setTimeout(async () => {
      const img = await win.webContents.capturePage()
      writeFileSync(process.env.THEFINDER_SCREENSHOT!, img.toPNG())
      console.log('[screenshot]', process.env.THEFINDER_SCREENSHOT)
    }, delay)
  }

  // Resume: rescan every root in the background (cheap: stat-only for unchanged files).
  const rescanAll = (): void => {
    for (const r of listRoots()) {
      void scanRoot(r.id, {
        onBatch: (rootId, _ids, n) => {
          queue?.setScanned(n)
          invalidateIds()
          push('library:changed', { rootId })
          queue?.poke()
        },
        onDone: (rootId) => {
          invalidateIds()
          push('library:changed', { rootId })
          push('roots:changed', undefined)
          queue?.poke()
        }
      })
    }
  }
  setTimeout(rescanAll, 1500)
  startWatcher(rescanAll)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  if (!queue) return
  e.preventDefault()
  const q = queue
  queue = null
  stopWatcher()
  await q.stop()
  closeDb()
  app.quit()
})
