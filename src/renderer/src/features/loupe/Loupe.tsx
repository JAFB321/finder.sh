import { useEffect } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { Tip } from '@renderer/components/ui/Tooltip'
import { assetUrl, thumbUrl } from '@renderer/lib/api'
import { useLibrary } from '../library/store'
import { Filmstrip } from './Filmstrip'
import { loadImage } from './preload'
import { Stage } from './Stage'

/** Filmstrip + big image. Opened with Space/Enter/double-click, or as layout 4. */
export function Loupe({ embedded }: { embedded?: boolean }): React.JSX.Element | null {
  const ids = useLibrary((s) => s.ids)
  const tiles = useLibrary((s) => s.tiles)
  const cursor = useLibrary((s) => s.cursor)
  const select = useLibrary((s) => s.select)
  const setLoupe = useLibrary((s) => s.setLoupe)
  const open = useLibrary((s) => s.loupe) || !!embedded
  const idx = cursor >= 0 ? cursor : 0
  const id = ids[idx]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // stopImmediatePropagation: the grid underneath listens on window too and would move by rows
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopImmediatePropagation()
        select(Math.max(0, idx - 1), 'single')
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopImmediatePropagation()
        select(Math.min(ids.length - 1, idx + 1), 'single')
      } else if (e.key === 'Escape' && !embedded) {
        e.stopImmediatePropagation()
        setLoupe(false)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [open, idx, ids.length, select, setLoupe, embedded])

  // Warm neighbours (debounced so holding an arrow key doesn't flood the protocol handlers).
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      for (const j of [idx + 1, idx - 1]) {
        const nid = ids[j]
        if (nid == null || useLibrary.getState().tiles.get(nid)?.thumb !== 1) continue
        loadImage(thumbUrl(nid, 1024)).catch(() => {})
        loadImage(assetUrl(nid)).catch(() => {})
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [open, idx, ids])

  if (!open || id == null) return null
  const tile = tiles.get(id)

  const body = (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="relative min-h-0 flex-1">
        <Stage id={id} ready={tile?.thumb === 1} natW={tile?.w ?? 0} embedded={embedded} />
        {!embedded && (
          <Tip label="Close" shortcut="Esc" side="left">
            <button
              onClick={() => setLoupe(false)}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur transition-colors duration-150 hover:bg-black/60"
            >
              <X size={16} />
            </button>
          </Tip>
        )}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] tabular-nums text-white/80 backdrop-blur">
          {idx + 1} / {ids.length}
        </div>
      </div>
      <Filmstrip ids={ids} tiles={tiles} idx={idx} onPick={(i) => select(i, 'single')} />
    </div>
  )

  if (embedded) return body
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-40"
    >
      {body}
    </motion.div>
  )
}
