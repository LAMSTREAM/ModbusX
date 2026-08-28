import React from 'react'
import { ChevronDown } from 'lucide-react'
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
          {logs.length > 0 && !showLogs && (
            <span className="ml-2 font-normal text-muted-foreground">
              {logs[logs.length - 1].msg}
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
        {logs.map((l) => (
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
