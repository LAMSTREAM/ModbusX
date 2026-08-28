import React from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'
import { CONTROL, CONTROL_QUIET } from '../lib/ui-density'
import type { ConnectionSettings } from '../../../modbus/modbus'

type DataBits = NonNullable<ConnectionSettings['dataBits']>
type Parity = NonNullable<ConnectionSettings['parity']>
type StopBits = NonNullable<ConnectionSettings['stopBits']>

export interface SerialFramingProps {
  dataBits: DataBits
  parity: Parity
  stopBits: StopBits
  onChange: <K extends 'dataBits' | 'parity' | 'stopBits'>(
    key: K,
    value: ConnectionSettings[K]
  ) => void
}

const PARITY_LETTER: Record<Parity, string> = { none: 'N', even: 'E', odd: 'O' }

/**
 * Serial framing as the conventional `8N1` summary, editable in a popover.
 *
 * The trigger shows the current value rather than a gear icon on purpose:
 * framing is set once per device but is a prime suspect when a link will not
 * come up, so it has to be readable without opening anything. Editing lives in
 * the popover so three selects do not have to fit in the connection row — and
 * so flow control or an inter-frame delay have somewhere to go later.
 */
const SerialFraming: React.FC<SerialFramingProps> = ({ dataBits, parity, stopBits, onChange }) => {
  const summary = `${dataBits}${PARITY_LETTER[parity]}${stopBits}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          title={`Data bits ${dataBits}, parity ${parity}, stop bits ${stopBits}`}
          className={cn('w-[74px] shrink-0 justify-between px-2 font-mono', CONTROL_QUIET)}
        >
          {summary}
          <ChevronDown size={12} strokeWidth={2} className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_84px] items-center gap-2">
            <Label className="text-xs leading-normal font-semibold">Data bits</Label>
            <Select
              value={String(dataBits)}
              onValueChange={(v) => onChange('dataBits', Number(v) as DataBits)}
            >
              <SelectTrigger className={cn(CONTROL, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="7">7</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_84px] items-center gap-2">
            <Label className="text-xs leading-normal font-semibold">Parity</Label>
            <Select value={parity} onValueChange={(v) => onChange('parity', v as Parity)}>
              <SelectTrigger className={cn(CONTROL, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="even">Even</SelectItem>
                <SelectItem value="odd">Odd</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_84px] items-center gap-2">
            <Label className="text-xs leading-normal font-semibold">Stop bits</Label>
            <Select
              value={String(stopBits)}
              onValueChange={(v) => onChange('stopBits', Number(v) as StopBits)}
            >
              <SelectTrigger className={cn(CONTROL, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Applied on the next connect.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default SerialFraming
