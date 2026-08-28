import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import type { LogItem } from '../lib/modbus-config'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

export interface LogPaneProps {
  logs: LogItem[]
  showLogs: boolean
  setShowLogs: (v: boolean) => void
  showRawLog: boolean
  setShowRawLog: (v: boolean) => void
  onClear: () => void
  /**
   * Named prop, deliberately NOT `ref`. The auto-scroll effect in
   * ModbusDebugger reads this node. React 19 would pass `ref` through to a
   * function component, but relying on that means this component must
   * destructure and forward it, and the failure mode if anyone gets that wrong
   * is the silent loss of log auto-scroll. A named prop is type-checked.
   */
  listRef: React.RefObject<HTMLDivElement | null>
}

const LogPane: React.FC<LogPaneProps> = ({
  logs,
  showLogs,
  setShowLogs,
  showRawLog,
  setShowRawLog,
  onClear,
  listRef
}) => {
  // Direction filter. Empty set = show everything, which is also what the
  // "All" chip resets to.
  const [hidden, setHidden] = useState<Set<LogItem['dir']>>(new Set())
  const [copied, setCopied] = useState(false)

  const visible = useMemo(
    () => (hidden.size === 0 ? logs : logs.filter((l) => !hidden.has(l.dir))),
    [logs, hidden]
  )

  const toggleDir = (d: LogItem['dir']): void =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  const copyAll = async (): Promise<void> => {
    // Copies what is on screen, not the whole buffer — if a filter is active
    // the visible rows are what the user means by "the log".
    const text = visible.map((l) => `${l.time}\t${l.dir}\t${l.msg}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard can be denied; failing silently is better than a dialog in
      // a debug tool.
    }
  }

  const DIRS: LogItem['dir'][] = ['SYS', 'TX', 'RX']
  const DIR_TONE: Record<string, string> = {
    SYS: 'text-destructive',
    TX: 'text-tx',
    RX: 'text-rx'
  }

  return (
    <Card
      className={cn(
        // bg-background is explicit and load-bearing: Card defaults to
        // bg-card, which is the Data Monitor panel's fill, not this one's.
        // Without the override the Logs panel would silently change colour.
        'flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-background py-0 shadow-none transition-[flex]',
        showLogs ? 'flex-1' : 'flex-[0_0_36px]'
      )}
    >
      <div
        className={cn(
          'flex h-9 shrink-0 cursor-default items-center justify-between gap-3 bg-muted pr-1 pl-3',
          showLogs && 'border-b'
        )}
      >
        <span className="truncate text-[11px] font-bold tracking-wide text-foreground">
          LOGS
          {visible.length > 0 && !showLogs && (
            <span className="ml-2 font-normal text-muted-foreground">
              {visible[visible.length - 1].msg}
            </span>
          )}
        </span>

        {/* One flex row owns the spacing. Previously each control carried its
            own margin and its own height, so the gaps between them did not
            match and the collapse arrow sat flush against the panel edge. Now
            all three are 28px high, share one gap, and hover identically. */}
        <div className="flex shrink-0 items-center gap-1">
          {showLogs && (
            <>
              {/* Direction filter. Dimmed chip = that direction is hidden. */}
              <div className="mr-1 flex items-center gap-0.5">
                {DIRS.map((d) => {
                  const on = !hidden.has(d)
                  return (
                    <Button
                      key={d}
                      variant="ghost"
                      onClick={() => toggleDir(d)}
                      title={on ? `Hide ${d}` : `Show ${d}`}
                      aria-pressed={on}
                      className={cn(
                        'h-7 rounded-md px-1.5 font-mono text-[11px] font-bold',
                        on ? DIR_TONE[d] : 'text-faint/60 line-through',
                        'hover:bg-background'
                      )}
                    >
                      {d}
                    </Button>
                  )
                })}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={copyAll}
                title={copied ? 'Copied' : 'Copy visible log'}
                aria-label="Copy visible log"
                className="size-7 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
              >
                {copied ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : (
                  <Copy size={13} strokeWidth={2} />
                )}
              </Button>

              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />

              <Label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] leading-normal font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                {/* onCheckedChange yields boolean | 'indeterminate'; coerce, or
                    a non-boolean reaches SavedConfig and AC12's shape check
                    fails. */}
                <Checkbox
                  checked={showRawLog}
                  onCheckedChange={(v) => setShowRawLog(Boolean(v))}
                  className="size-3.5"
                />
                Show Raw
              </Label>

              <Button
                variant="ghost"
                onClick={onClear}
                className="h-7 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:bg-background hover:text-foreground"
              >
                Clear
              </Button>

              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            </>
          )}

          {/* Independent click area — collapsing must not be triggered by the
              header bar itself. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={showLogs ? 'Collapse log pane' : 'Expand log pane'}
            onClick={() => setShowLogs(!showLogs)}
            className="size-7 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              className={cn('transition-transform duration-200', !showLogs && '-rotate-180')}
            />
          </Button>
        </div>
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-normal"
      >
        {visible.length === 0 && logs.length > 0 && (
          <div className="py-2 text-faint">All {logs.length} entries hidden by the filter.</div>
        )}
        {visible.map((l) => (
          <div key={l.id} className="mb-1 flex gap-2">
            <span className="min-w-[60px] text-faint">{l.time}</span>
            <span
              className={cn(
                'min-w-6 font-bold',
                l.dir === 'TX' ? 'text-tx' : l.dir === 'RX' ? 'text-rx' : 'text-destructive'
              )}
            >
              {l.dir}
            </span>
            <span className="text-muted-foreground">{l.msg}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default LogPane
