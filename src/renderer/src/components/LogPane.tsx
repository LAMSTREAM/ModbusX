import React from 'react'
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
        showLogs ? 'flex-1' : 'flex-[0_0_32px]'
      )}
    >
      <div
        className={cn(
          'flex h-8 cursor-default items-center justify-between bg-muted px-3',
          showLogs && 'border-b'
        )}
      >
        <span className="text-[11px] font-bold text-foreground">
          LOGS {logs.length > 0 && !showLogs && `— ${logs[logs.length - 1].msg}`}
        </span>
        <div className="flex items-center gap-2">
          {showLogs && (
            <Label className="mr-1.5 flex cursor-pointer items-center gap-1 text-[11px] leading-normal font-semibold text-muted-foreground">
              {/* onCheckedChange yields boolean | 'indeterminate'; coerce, or a
                  non-boolean reaches SavedConfig and AC12's shape check fails. */}
              <Checkbox
                checked={showRawLog}
                onCheckedChange={(v) => setShowRawLog(Boolean(v))}
                className="size-3.5"
              />
              Show Raw
            </Label>
          )}

          {showLogs && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-auto p-0 text-[11px] text-muted-foreground hover:bg-transparent"
            >
              Clear
            </Button>
          )}

          {/* Independent click area — collapsing must not be triggered by the
              header bar itself. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLogs(!showLogs)}
            className="size-6 text-[10px] text-faint hover:bg-transparent"
          >
            {showLogs ? '▼' : '▲'}
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
