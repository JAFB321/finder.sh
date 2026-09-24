import { useEffect } from 'react'
import type { Invoke, InvokeName, Push, PushName } from '@shared/ipc'

export const api = window.api

export function invoke<K extends InvokeName>(
  name: K,
  arg: Invoke[K]['arg']
): Promise<Invoke[K]['res']> {
  return api.invoke(name, arg)
}

/** Subscribe to a push event for the lifetime of the component. */
export function usePush<K extends PushName>(
  name: K,
  cb: (payload: Push[K]) => void,
  deps: unknown[] = []
): void {
  useEffect(() => api.on(name, cb), deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export const thumbUrl = (id: number, size: 256 | 1024 | 2560): string => `thumb://a/${id}?s=${size}`
export const assetUrl = (id: number): string => `asset://a/${id}`
