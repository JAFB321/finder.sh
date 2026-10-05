import * as RT from '@radix-ui/react-tooltip'

/** Wrap the whole app once. */
export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <RT.Provider delayDuration={450} skipDelayDuration={200}>
      {children}
    </RT.Provider>
  )
}

interface TipProps {
  label: React.ReactNode
  /** optional keyboard hint shown dimmed after the label, e.g. "S" or "⌘K" */
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactElement
}

/**
 * Tooltip for icon buttons. The child must forward its ref (plain <button> is fine).
 *   <Tip label="Find similar" shortcut="S"><button>…</button></Tip>
 */
export function Tip({ label, shortcut, side = 'bottom', children }: TipProps): React.JSX.Element {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] select-none rounded-[6px] border border-line bg-bg-3 px-2 py-1 text-[11.5px] text-fg shadow-xl data-[state=delayed-open]:animate-[fade-in_120ms_ease-out]"
        >
          {label}
          {shortcut && <span className="ml-2 text-fg-3">{shortcut}</span>}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}
