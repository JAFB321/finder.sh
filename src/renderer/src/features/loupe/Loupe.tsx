import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { assetUrl, thumbUrl } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useLibrary } from '../library/store'

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
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        select(Math.max(0, idx - 1), 'single')
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        select(Math.min(ids.length - 1, idx + 1), 'single')
      } else if (e.key === 'Escape' && !embedded) setLoupe(false)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [open, idx, ids.length, select, setLoupe, embedded])

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [idx, open])

  if (!open || id == null) return null
  const tile = tiles.get(id)
  const from = Math.max(0, idx - 30)
  const window_ = ids.slice(from, idx + 30)

  const body = (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img
            key={id}
            src={tile?.thumb === 1 ? assetUrl(id) : undefined}
            alt=""
            draggable={false}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="max-h-full max-w-full rounded-[4px] object-contain shadow-[0_20px_60px_rgba(0,0,0,.5)]"
          />
        </AnimatePresence>
        {!embedded && (
          <button
            onClick={() => setLoupe(false)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur hover:bg-black/60"
          >
            <X size={16} />
          </button>
        )}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] tabular-nums text-white/80 backdrop-blur">
          {idx + 1} / {ids.length}
        </div>
      </div>
      <div
        ref={strip}
        className="flex h-[92px] shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line bg-bg-1 px-3"
      >
        {window_.map((tid, k) => {
          const i = from + k
          const t = tiles.get(tid)
          const ar = t && t.w && t.h ? t.w / t.h : 1.5
          return (
            <button
              key={tid}
              data-i={i}
              onClick={() => select(i, 'single')}
              className={cn(
                'h-[68px] shrink-0 overflow-hidden rounded-[4px] bg-bg-2 transition-[transform,box-shadow] duration-150 ease-out-quart',
                i === idx ? 'ring-2 ring-accent' : 'opacity-75 hover:opacity-100'
              )}
              style={{ width: Math.round(68 * ar) }}
            >
              {t?.thumb === 1 && (
                <img
                  src={thumbUrl(tid, 256)}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </button>
          )
        })}
      </div>
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
