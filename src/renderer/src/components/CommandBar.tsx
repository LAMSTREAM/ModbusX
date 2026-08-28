import React from 'react'
import { FUNCTION_CODES, type AddressFormat } from '../lib/modbus-config'
import { parseFC, toWireAddress } from '../lib/modbus-format'
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
  /** Display offset; the wire address is `typed - addrBase`. */
  addrBase: number
  setAddrBase: (v: number) => void
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
  addrBase,
  setAddrBase,
  effectiveFc,
  connected,
  sending,
  onCommand,
  onMainAction
}) => {
  // Inline validation. Previously an unparseable address or an over-length
  // count only surfaced as "Read Error" in the log after a round trip.
  const wireAddr = toWireAddress(address, addrFormat, addrBase)
  const count = parseInt(countParam, 10)
  const isRead = [1, 2, 3, 4].includes(parseFC(effectiveFc))

  const addrError = Number.isNaN(wireAddr)
    ? `Not a valid ${addrFormat} number`
    : wireAddr < 0
      ? `Below the base offset (${addrBase})`
      : wireAddr > 0xffff
        ? 'Above 0xFFFF'
        : null

  // 125 is the protocol ceiling for FC 3/4, not a UI choice: the response's
  // byte-count field is one byte, and this app sends each read as a single
  // transaction with no chunking.
  const countError = Number.isNaN(count)
    ? 'Not a number'
    : count < 1
      ? 'Must be at least 1'
      : isRead && count > 125
        ? 'Max 125 per read (protocol limit)'
        : null

  const invalid = Boolean(addrError) || Boolean(countError)

  return (
    <div className={ROW}>
      <div className="shrink-0 grow-0 basis-[300px]">
        <Label className={LABEL}>Function</Label>
        <div className="flex">
          {customFcMode ? (
            <Input
              className={cn(CONTROL, 'w-[230px]', JOIN_LEFT)}
              value={customFcValue}
              onChange={(e) => setCustomFcValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCommand()}
              placeholder="FC (e.g. 0x06)"
            />
          ) : (
            <Select value={standardFc} onValueChange={setStandardFc}>
              <SelectTrigger className={cn(CONTROL, 'w-[230px] font-mono', JOIN_LEFT)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUNCTION_CODES.map((fc) => (
                  <SelectItem key={fc.value} value={fc.value}>
                    <span className="font-mono">{fc.label}</span>
                    <span className="ml-2 text-muted-foreground">{fc.name}</span>
                  </SelectItem>
                ))}
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
        <Label className={LABEL}>
          Address ({addrFormat})
          {addrBase !== 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              wire {Number.isNaN(wireAddr) ? '—' : wireAddr}
            </span>
          )}
        </Label>
        <div className="flex">
          <Input
            aria-invalid={Boolean(addrError)}
            title={addrError ?? undefined}
            className={cn(
              CONTROL,
              'w-full font-mono',
              JOIN_LEFT,
              addrError && 'border-destructive focus-visible:border-destructive'
            )}
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
        {addrError && <p className="mt-1 text-[11px] text-destructive">{addrError}</p>}
      </div>

      {/* Base sits beside Address, not with the connection settings: it changes
          what the number in that field MEANS, which is the same kind of thing
          as the HEX/DEC toggle. It gets its own caption because unlabelled it
          reads as an orphan between Address and Count. */}
      <div className="shrink-0 grow-0 basis-[92px]">
        <Label className={LABEL} title="The display address that maps to wire register 0">
          Base
        </Label>
        <Input
          type="number"
          title="Base offset — the display address of wire register 0"
          className={cn(CONTROL, 'w-full font-mono')}
          value={addrBase}
          onChange={(e) => setAddrBase(parseInt(e.target.value, 10) || 0)}
          onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
        />
      </div>
      <div className="shrink-0 grow-0 basis-25">
        <Label className={LABEL}>Count</Label>
        <Input
          aria-invalid={Boolean(countError)}
          title={countError ?? undefined}
          className={cn(
            CONTROL,
            'w-full font-mono',
            countError && 'border-destructive focus-visible:border-destructive'
          )}
          value={countParam}
          onChange={(e) => setCountParam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
        />
        {countError && <p className="mt-1 text-[11px] text-destructive">{countError}</p>}
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
          disabled={!connected || sending || invalid}
          title={invalid ? (addrError ?? countError ?? undefined) : undefined}
          className="w-25 border-0 bg-action font-semibold text-action-foreground hover:bg-action/90"
        >
          {sending ? '...' : 'Exec'}
        </Button>
      </div>
    </div>
  )
}

export default CommandBar
