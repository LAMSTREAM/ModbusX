import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { DataFormat } from '../lib/modbus-config'
import { Card } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { cn } from '../lib/utils'

export interface DataMonitorProps {
  dataFormat: DataFormat
  /** First wire address in the grid, for the row-offset ruler. */
  startAddr: number | null
  /** Total cells rendered, so the ruler stops where the grid does. */
  cellCount: number
  /** Display offset, so the ruler agrees with the cell labels. */
  addrBase: number
  addrFormat: 'HEX' | 'DEC'
  setDataFormat: (f: DataFormat) => void
  /** `showLogs` — drives the flex 2 vs 1 split against the log pane. */
  expanded: boolean
  /** The memoized grid element, built in ModbusDebugger. */
  children: React.ReactNode
}

const FORMATS: DataFormat[] = ['DEC_U', 'DEC_S', 'UINT32', 'HEX', 'FLOAT', 'ASCII']

// Compressed to the pre-rewrite metrics: 4px/8px padding, 11px semibold.
// shadcn's ToggleGroupItem is taller and larger by default.
const FORMAT_ITEM = cn(
  'h-auto rounded-sm px-2 py-1 text-[11px] font-semibold',
  // Paired with the Step 7 inventory: ToggleGroupItem inherits Button's
  // dark:hover:bg-accent/50, a different modifier from any bare bg- override.
  'dark:hover:bg-muted'
)

const DataMonitor: React.FC<DataMonitorProps> = ({
  dataFormat,
  setDataFormat,
  startAddr,
  cellCount,
  addrBase,
  addrFormat,
  expanded,
  children
}) => {
  // The grid is auto-fill, so its column count is a function of the container
  // width and can only be known after layout. Measure it rather than deriving
  // it from an assumed cell width, and keep the measurement OUT of the
  // memoized grid so it cannot re-render cells.
  const bodyRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ cols: number; rowH: number } | null>(null)

  const measure = useCallback(() => {
    const grid = bodyRef.current?.querySelector<HTMLElement>(':scope > div')
    const first = grid?.firstElementChild as HTMLElement | null
    if (!grid || !first) {
      setLayout(null)
      return
    }
    const cols = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const rowH = first.offsetHeight + gap
    setLayout((prev) => (prev && prev.cols === cols && prev.rowH === rowH ? prev : { cols, rowH }))
  }, [])

  useEffect(() => {
    measure()
    const el = bodyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, children])

  const rows =
    layout && startAddr !== null && cellCount > 0 && layout.cols > 0
      ? Math.ceil(cellCount / layout.cols)
      : 0
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
      <div className="flex min-h-0 flex-1">
        {/* Row-offset gutter. Rendered as a sibling of the scroll body and
            scrolled with it, so it never becomes part of the grid's own
            layout. It does cost horizontal space, which is why it is as narrow
            as a 4-digit hex address allows. */}
        {rows > 0 && layout && (
          <div
            aria-hidden="true"
            className="shrink-0 overflow-hidden border-r bg-background/40 py-4 pr-2 pl-3"
            style={{ marginTop: -(bodyRef.current?.scrollTop ?? 0) }}
          >
            {Array.from({ length: rows }, (_, r) => {
              const addr = (startAddr ?? 0) + r * layout.cols
              const shown = addr + addrBase
              return (
                <div
                  key={r}
                  className="text-right font-mono text-[10px] text-faint tabular-nums"
                  style={{ height: layout.rowH, lineHeight: `${layout.rowH}px` }}
                >
                  {addrFormat === 'HEX'
                    ? shown.toString(16).toUpperCase().padStart(4, '0')
                    : shown.toString()}
                </div>
              )
            })}
          </div>
        )}
        {/* `data-grid-body` is a deliberate hook for the verification scripts.
            The structural selectors they used were correct while the rewrite
            was in flight, but they have now had to be re-anchored three times
            as the tree gained levels. A named hook is stable by intent. */}
        <div
          ref={bodyRef}
          data-grid-body=""
          className="min-w-0 flex-1 overflow-y-auto p-4"
          onScroll={measure}
        >
          {children}
        </div>
      </div>
    </Card>
  )
}

export default DataMonitor
