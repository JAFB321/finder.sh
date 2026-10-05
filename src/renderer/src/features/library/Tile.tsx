import { memo } from 'react'
import { AssetFlag, LABEL_COLORS, type AssetTile } from '@shared/types'
import { thumbUrl } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

interface Props {
  tile: AssetTile | undefined
  id: number
  x: number
  y: number
  w: number
  h: number
  selected: boolean
  focused: boolean
  contain: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}

export const Tile = memo(function Tile({
  tile,
  id,
  x,
  y,
  w,
  h,
  selected,
  focused,
  contain,
  onMouseDown,
  onDoubleClick
}: Props) {
  const ready = tile?.thumb === 1
  const failed = tile?.thumb === -1
  const size = Math.max(w, h) * (window.devicePixelRatio || 1) > 300 ? 1024 : 256
  const label = tile?.label ?? 0
  const offline = !!(tile && tile.flags & (AssetFlag.Offline | AssetFlag.Missing))
  const pair = !!(tile && tile.flags & AssetFlag.Pair)
  const video = !!(tile && tile.flags & AssetFlag.Video)
  return (
    <div
      data-id={id}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        'absolute overflow-hidden rounded-[6px] bg-bg-2 transition-[box-shadow,filter] duration-150 ease-out-quart cursor-default group',
        selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
        focused && !selected && 'ring-1 ring-line-2',
        offline && 'opacity-60'
      )}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: w,
        height: h,
        willChange: 'transform'
      }}
    >
      {ready ? (
        <img
          src={thumbUrl(id, size)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={cn(
            'tile-img block h-full w-full',
            contain ? 'object-contain' : 'object-cover'
          )}
        />
      ) : failed ? (
        <div className="flex h-full w-full items-center justify-center text-fg-3 text-[11px]">
          no preview
        </div>
      ) : (
        <div className="skeleton h-full w-full" />
      )}
      {/* hover veil */}
      <div className="pointer-events-none absolute inset-0 bg-white/0 transition-colors duration-150 group-hover:bg-white/[0.04]" />
      {label > 0 && (
        <span
          className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full shadow-[0_0_0_1.5px_rgba(0,0,0,.55)]"
          style={{ background: LABEL_COLORS[label].hex }}
        />
      )}
      {pair && (
        <span className="absolute right-1.5 top-1.5 rounded-[3px] bg-black/60 px-1 py-[1px] text-[9px] font-medium tracking-wide text-white/80 backdrop-blur">
          RAW+JPG
        </span>
      )}
      {video && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-[3px] bg-black/60 px-1 py-[1px] text-[9px] font-medium tabular-nums text-white/85 backdrop-blur">
          <svg viewBox="0 0 8 8" className="h-[7px] w-[7px] fill-current" aria-hidden>
            <path d="M1.5 0.8v6.4L7 4z" />
          </svg>
          {tile?.dur != null && formatDuration(tile.dur)}
        </span>
      )}
      {offline && (
        <span className="absolute bottom-1.5 right-1.5 rounded-[3px] bg-black/60 px-1 py-[1px] text-[9px] text-white/70">
          offline
        </span>
      )}
    </div>
  )
})

function formatDuration(sec: number): string {
  const t = Math.max(0, Math.round(sec))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
