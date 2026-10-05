import { cn } from '@renderer/lib/utils'
import { countLabel, type TimeGroup, type TimeGroupSetting } from './sections'

export function SectionHeaderRow({
  label,
  count,
  floating,
  className,
  style,
  children
}: {
  label: string
  count: number
  floating?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none flex items-center gap-2 pb-1',
        floating && 'bg-gradient-to-b from-bg via-bg/95 to-bg/80',
        className
      )}
      style={style}
    >
      <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg">{label}</span>
      <span className="shrink-0 text-[11.5px] tabular-nums text-fg-3">· {countLabel(count)}</span>
      <div className="flex-1" />
      {children}
    </div>
  )
}

const OPTIONS: { value: TimeGroupSetting; label: string; title: string }[] = [
  { value: 'auto', label: 'Auto', title: 'Group by thumbnail size' },
  { value: 'day', label: 'Day', title: 'Group by day (])' },
  { value: 'month', label: 'Month', title: 'Group by month' },
  { value: 'year', label: 'Year', title: 'Group by year ([)' }
]

export function GroupSwitch({
  value,
  effective,
  onChange
}: {
  value: TimeGroupSetting
  effective: TimeGroup
  onChange: (g: TimeGroupSetting) => void
}): React.JSX.Element {
  return (
    <div className="pointer-events-auto mr-1 flex items-center gap-0.5 rounded-[6px] bg-white/[0.05] p-0.5">
      {OPTIONS.map((o) => {
        const active = value === o.value
        // in auto mode, hint which level auto currently resolves to
        const implied = value === 'auto' && o.value === effective
        return (
          <button
            key={o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-[20px] rounded-[4px] px-1.5 text-[11px] transition-colors duration-150',
              active
                ? 'bg-white/[0.12] text-fg'
                : implied
                  ? 'text-fg-2 underline decoration-accent/70 underline-offset-[3px]'
                  : 'text-fg-3 hover:text-fg-2'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
