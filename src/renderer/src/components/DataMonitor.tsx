import React from 'react'
import type { DataFormat } from '../lib/modbus-config'
import { Card } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { cn } from '../lib/utils'

export interface DataMonitorProps {
  dataFormat: DataFormat
  setDataFormat: (f: DataFormat) => void
  /** `showLogs` — drives the flex 2 vs 1 split against the log pane. */
  expanded: boolean
  /** The memoized grid element, built in ModbusDebugger. */
  children: React.ReactNode
}

const FORMATS: DataFormat[] = ['BIN', 'HEX', 'UINT16', 'SINT16', 'UINT32', 'FLOAT', 'ASCII']

// Compressed to the pre-rewrite metrics: 4px/8px padding, 11px semibold.
// shadcn's ToggleGroupItem is taller and larger by default.
const FORMAT_ITEM = cn(
  'h-auto rounded-sm px-2 py-1 text-[11px] font-semibold text-muted-foreground',
  // Paired with the dark: inventory: ToggleGroupItem inherits Button's
  // dark:hover:bg-accent/50, a different modifier from any bare bg- override.
  'dark:hover:bg-muted',
  // shadcn's default selected state is `bg-accent`, which maps to the quiet
  // zinc hover surface — on the light card that is all but invisible. A tinted
  // action chip with a ring reads clearly in both themes without the weight of
  // a solid fill.
  'data-[state=on]:bg-action/12 data-[state=on]:text-action',
  'data-[state=on]:ring-1 data-[state=on]:ring-action/30 data-[state=on]:ring-inset',
  'dark:data-[state=on]:bg-action/22 dark:data-[state=on]:ring-action/40'
)

const DataMonitor: React.FC<DataMonitorProps> = ({
  dataFormat,
  setDataFormat,
  expanded,
  children
}) => {
  return (
    <Card
      className={cn(
        'flex min-h-0 flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card py-0 shadow-none transition-[flex]',
        expanded ? 'flex-2' : 'flex-1'
      )}
    >
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <span className="text-[13px] font-semibold text-foreground">Data Monitor</span>
        <ToggleGroup
          type="single"
          value={dataFormat}
          // Radix emits '' when the active item is re-clicked. Without this
          // guard the format would unset and the grid would blank out.
          onValueChange={(v) => v && setDataFormat(v as DataFormat)}
          className="gap-1"
        >
          {FORMATS.map((f) => (
            <ToggleGroupItem key={f} value={f} className={FORMAT_ITEM}>
              {f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {/* `data-grid-body` is a stable hook for the verification scripts; the
          structural selectors they used had to be re-anchored every time the
          tree gained a level. */}
      <div data-grid-body="" className="min-h-0 flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </Card>
  )
}

export default DataMonitor
