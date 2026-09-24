import { BrowserWindow, ipcMain } from 'electron'
import type { Invoke, InvokeName, Push, PushName } from '@shared/ipc'

export function handle<K extends InvokeName>(
  name: K,
  fn: (arg: Invoke[K]['arg']) => Invoke[K]['res'] | Promise<Invoke[K]['res']>
): void {
  ipcMain.handle(name, (_e, arg) => fn(arg as Invoke[K]['arg']))
}

export function push<K extends PushName>(name: K, payload: Push[K]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(name, payload)
  }
}
