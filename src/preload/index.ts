import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/ipc'

const api: Api = {
  invoke: (name, arg) => ipcRenderer.invoke(name, arg),
  on: (name, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload as never)
    ipcRenderer.on(name, listener)
    return () => ipcRenderer.removeListener(name, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
