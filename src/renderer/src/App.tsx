import { useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { invoke, usePush } from '@renderer/lib/api'
import { Sidebar } from './features/sources/Sidebar'
import { Toolbar } from './features/filters/Toolbar'
import { Grid } from './features/library/Grid'
import { Inspector } from './features/inspector/Inspector'
import { Loupe } from './features/loupe/Loupe'
import { CommandPalette } from './features/palette/CommandPalette'
import { useLibrary } from './features/library/store'
import { TooltipProvider } from './components/ui/Tooltip'
import type { LayoutKind } from '@shared/types'

// automation hook (see THEFINDER_STEPS in main); harmless in production
;(window as unknown as { __tf: typeof useLibrary }).__tf = useLibrary

export default function App(): React.JSX.Element {
  const reload = useLibrary((s) => s.reload)
  const patchTiles = useLibrary((s) => s.patchTiles)
  const layout = useLibrary((s) => s.layout)
  const inspector = useLibrary((s) => s.inspector)
  const loupe = useLibrary((s) => s.loupe)

  useEffect(() => void reload(), [reload])
  usePush('library:changed', () => void reload(), [reload])
  usePush('assets:updated', (p) => void patchTiles(p.ids), [patchTiles])

  // global shortcuts: labels, layouts, size, inspector, similar, duplicates
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useLibrary.getState()
      const sel = [...s.selected]
      const labelKeys: Record<string, number> = { '6': 1, '7': 2, '8': 3, '9': 4, '5': 5, '0': 0 }
      if (e.key in labelKeys && sel.length) {
        e.preventDefault()
        void invoke('tags:setLabel', { ids: sel, label: labelKeys[e.key] })
        return
      }
      const layouts: Record<string, LayoutKind> = {
        '1': 'justified',
        '2': 'grid',
        '3': 'masonry',
        '4': 'filmstrip',
        // not '5': that key is the purple label when something is selected
        y: 'timeline'
      }
      if (e.key in layouts) return s.setLayout(layouts[e.key])
      if (e.key === '-') return s.setSize(s.size - 20)
      if (e.key === '=' || e.key === '+') return s.setSize(s.size + 20)
      if (e.key === 'i') return s.toggleInspector()
      if (e.key === 's' && sel.length === 1)
        return s.setFilter({
          similarTo: sel[0],
          text: undefined,
          color: undefined,
          duplicatesOnly: undefined
        })
      if (e.key === 'd')
        return s.setFilter({ duplicatesOnly: !s.filter.duplicatesOnly || undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-full w-full">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar />
          <div className="relative min-h-0 flex-1">
            {layout === 'filmstrip' ? <Loupe embedded /> : <Grid />}
            <AnimatePresence>
              {loupe && layout !== 'filmstrip' && <Loupe key="loupe" />}
            </AnimatePresence>
          </div>
        </main>
        {inspector && <Inspector />}
        <CommandPalette />
      </div>
    </TooltipProvider>
  )
}
