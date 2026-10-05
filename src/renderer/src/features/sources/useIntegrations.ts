import { useEffect, useState } from 'react'
import type { Invoke } from '@shared/ipc'
import { invoke } from '@renderer/lib/api'

type Integrations = Invoke['app:integrations']['res']
let integrations: Promise<Integrations> | null = null
/** Installed third-party apps (fetched once per session). null while loading. */
export function useIntegrations(): Integrations | null {
  const [v, setV] = useState<Integrations | null>(null)
  useEffect(() => {
    let live = true
    integrations ??= invoke('app:integrations', undefined)
    void integrations.then((r) => live && setV(r))
    return () => {
      live = false
    }
  }, [])
  return v
}
