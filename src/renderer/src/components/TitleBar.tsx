import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import BrandMark from './BrandMark'
import ThemeToggle from './ThemeToggle'
import { cn } from '../lib/utils'
import type { Theme } from '../hooks/useTheme'

interface TitleBarProps {
  theme: Theme
  onToggleTheme: () => void
}

const isMac = window.windowAPI?.platform === 'darwin'

/**
 * The app's own title bar. The window is frameless on Windows and Linux, so
 * this is the only chrome there; on macOS the traffic lights are kept
 * (hiddenInset) and this just pads around them.
 *
 * The whole strip is a drag region via `app-region: drag`. Anything
 * interactive inside it must opt back out with `no-drag`, or it becomes
 * un-clickable — the drag region swallows the press before it reaches the
 * button.
 */
const TitleBar: React.FC<TitleBarProps> = ({ theme, onToggleTheme }) => {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    window.windowAPI?.isMaximized().then((m) => {
      if (alive) setMaximized(m)
    })
    // Maximize state also changes from outside this component — a double-click
    // on the drag region, Win+Up, a snap — so mirror the main process rather
    // than tracking it locally.
    const off = window.windowAPI?.onMaximizedChanged(setMaximized)
    return () => {
      alive = false
      off?.()
    }
  }, [])

  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between gap-3 border-b bg-card pr-0 pl-3 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className={cn('flex items-center gap-2', isMac && 'pl-16')}>
        <BrandMark size={16} />
        <span className="text-[13px] font-semibold tracking-[0.01em] text-foreground">ModbusX</span>
      </div>

      <div
        className="flex h-full items-center gap-1 pr-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        {/* macOS already draws its own controls; only Windows and Linux need these. */}
        {!isMac && (
          <div className="ml-1 flex h-full items-stretch">
            <button
              type="button"
              aria-label="Minimize"
              onClick={() => window.windowAPI?.minimize()}
              className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Minus size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label={maximized ? 'Restore' : 'Maximize'}
              onClick={() => window.windowAPI?.toggleMaximize()}
              className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {maximized ? (
                <Copy size={13} strokeWidth={2} className="-scale-x-100" />
              ) : (
                <Square size={12} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              aria-label="Close"
              // The only control that gets a colour on hover, matching the
              // platform convention that close is the destructive one.
              onClick={() => window.windowAPI?.close()}
              className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default TitleBar
