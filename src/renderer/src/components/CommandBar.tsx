import React from 'react'
import type { AddressFormat } from '../lib/modbus-config'
import { parseFC } from '../lib/modbus-format'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'
import { CONTROL, CONTROL_QUIET, LABEL, ROW } from '../lib/ui-density'

export interface CommandBarProps {
  customFcMode: boolean
  setCustomFcMode: (v: boolean) => void
  standardFc: string
  setStandardFc: (v: string) => void
  customFcValue: string
  setCustomFcValue: (v: string) => void
  address: string
  setAddress: (v: string) => void
  countParam: string
  setCountParam: (v: string) => void
  autoRead: boolean
  setAutoRead: (v: boolean) => void
  addrFormat: AddressFormat
  toggleAddrFormat: () => void
  effectiveFc: string
  connected: boolean
  sending: boolean
  onCommand: () => void
  onMainAction: () => void
}

// The two joined pairs below fake a segmented control the way the pre-rewrite
// markup did: kill the inner border and split the radii. shadcn's input-group
// is deliberately not used — it would restructure the DOM that AC6 pins.
const JOIN_LEFT = 'rounded-r-none border-r-0'
const JOIN_RIGHT = 'rounded-l-none'

const CommandBar: React.FC<CommandBarProps> = ({
  customFcMode,
  setCustomFcMode,
  standardFc,
  setStandardFc,
  customFcValue,
  setCustomFcValue,
  address,
  setAddress,
  countParam,
  setCountParam,
  autoRead,
  setAutoRead,
  addrFormat,
  toggleAddrFormat,
  effectiveFc,
  connected,
  sending,
  onCommand,
  onMainAction
}) => {
  return (
    <div className={ROW}>
      <div className="shrink-0 grow-0 basis-[220px]">
        <Label className={LABEL}>Function</Label>
        <div className="flex">
          {customFcMode ? (
            <Input
              className={cn(CONTROL, 'w-[150px]', JOIN_LEFT)}
              value={customFcValue}
              onChange={(e) => setCustomFcValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCommand()}
              placeholder="FC (e.g. 0x06)"
            />
          ) : (
            <Select value={standardFc} onValueChange={setStandardFc}>
              <SelectTrigger className={cn(CONTROL, 'w-[150px]', JOIN_LEFT)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">03 Read Holding</SelectItem>
                <SelectItem value="4">04 Read Input</SelectItem>
                <SelectItem value="1">01 Read Coils</SelectItem>
                <SelectItem value="6">06 Write Single</SelectItem>
                <SelectItem value="16">16 Write Multi</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => setCustomFcMode(!customFcMode)}
            className={cn('w-[70px] px-0 text-[11px] font-semibold', CONTROL_QUIET, JOIN_RIGHT)}
          >
            {customFcMode ? 'Custom' : 'Std'}
          </Button>
        </div>
      </div>
      <div className="flex-[1_1_120px]">
        <Label className={LABEL}>Address ({addrFormat})</Label>
        <div className="flex">
          <Input
            className={cn(CONTROL, 'w-full font-mono', JOIN_LEFT)}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
          />
          {/* Stays a Button, not a ToggleGroup: toggleAddrFormat converts the
              address VALUE as a side effect, which a value-driven ToggleGroup
              would obscure. */}
          <Button
            variant="outline"
            onClick={toggleAddrFormat}
            className={cn('w-[50px] px-0 text-[11px] font-semibold', CONTROL_QUIET, JOIN_RIGHT)}
          >
            {addrFormat}
          </Button>
        </div>
      </div>
      <div className="shrink-0 grow-0 basis-25">
        <Label className={LABEL}>Count</Label>
        <Input
          className={cn(CONTROL, 'w-full font-mono')}
          value={countParam}
          onChange={(e) => setCountParam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
        />
      </div>
      <div className="flex items-end gap-2">
        {!(!customFcMode && [6, 16].includes(parseFC(effectiveFc))) && (
          <Button
            onClick={() => setAutoRead(!autoRead)}
            disabled={!connected}
            className={cn(
              'w-20 border-0 font-semibold',
              autoRead ? 'bg-success text-success-foreground hover:bg-success/90' : CONTROL_QUIET
            )}
          >
            {autoRead ? 'Stop' : 'Auto'}
          </Button>
        )}
        <Button
          onClick={onMainAction}
          disabled={!connected || sending}
          className="w-25 border-0 bg-action font-semibold text-action-foreground hover:bg-action/90"
        >
          {sending ? '...' : 'Exec'}
        </Button>
      </div>
    </div>
  )
}

export default CommandBar
