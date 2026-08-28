import React from 'react'
import { ConnectionSettings, ModbusMode } from '../../../modbus/modbus'
import { BAUD_RATES } from '../lib/modbus-config'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'
import SerialFraming from './SerialFraming'
import { CONTROL, CONTROL_QUIET, LABEL, ROW } from '../lib/ui-density'

export interface SettingsBarProps {
  settings: ConnectionSettings
  updateInfo: <K extends keyof ConnectionSettings>(k: K, v: ConnectionSettings[K]) => void
  ports: { path: string }[]
  /** False until the first scan resolves — lets the menu say "not scanned yet". */
  portsScanned: boolean
  scanPorts: () => void
  connected: boolean
  sending: boolean
  /** Last connection-level failure, cleared on a successful connect. */
  connError: string | null
  onConnect: () => void
  preventEnter: (e: React.KeyboardEvent) => void
}

const SettingsBar: React.FC<SettingsBarProps> = ({
  settings,
  updateInfo,
  ports,
  portsScanned,
  scanPorts,
  connected,
  sending,
  connError,
  onConnect,
  preventEnter
}) => {
  return (
    <div className={ROW}>
      <div className="shrink-0 grow-0 basis-20">
        <Label className={LABEL}>Mode</Label>
        {/* Radix Select is value-driven: onValueChange hands back a string,
            where the native element handed back e.target.value. */}
        <Select value={settings.mode} onValueChange={(v) => updateInfo('mode', v as ModbusMode)}>
          <SelectTrigger className={cn(CONTROL, 'w-full px-2')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RTU">RTU</SelectItem>
            <SelectItem value="TCP">TCP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="shrink-0 grow-0 basis-[70px]">
        <Label className={LABEL}>Slave ID</Label>
        <Input
          className={cn(CONTROL, 'w-full')}
          type="number"
          value={settings.slaveId}
          onChange={(e) => updateInfo('slaveId', parseInt(e.target.value))}
          onKeyDown={preventEnter}
        />
      </div>
      <div className="shrink-0 grow-0 basis-20">
        <Label className={LABEL}>Timeout</Label>
        <Input
          className={cn(CONTROL, 'w-full')}
          type="number"
          placeholder="ms"
          value={settings.timeout}
          onChange={(e) => updateInfo('timeout', parseInt(e.target.value) || 0)}
          onKeyDown={preventEnter}
        />
      </div>
      <div className="shrink-0 grow-0">
        {settings.mode === 'RTU' ? (
          <div className="flex flex-col">
            <Label className={LABEL}>Serial Port &amp; Baud</Label>
            <div className="flex gap-2">
              {/* With no items at all, Radix still mounts the popper — it has
                  nothing to measure against, so it lands as an empty sliver in
                  the top-left corner of the window. An explicit empty state
                  gives it content to position, and tells the user which case
                  they are in. */}
              <Select
                value={settings.serialPort || undefined}
                onValueChange={(v) => updateInfo('serialPort', v)}
              >
                <SelectTrigger className={cn(CONTROL, 'w-[132px] shrink-0 grow-0')}>
                  <SelectValue placeholder={portsScanned ? 'No ports found' : 'Scanning…'} />
                </SelectTrigger>
                <SelectContent>
                  {ports.length > 0 ? (
                    ports.map((p) => (
                      <SelectItem key={p.path} value={p.path}>
                        {p.path}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">
                      {portsScanned ? 'No serial ports found' : 'Scanning…'}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {/* The glyph stays a glyph. Swapping in a lucide RefreshCw would
                  be an appearance change nobody asked for. */}
              <Button
                variant="outline"
                size="icon"
                onClick={scanPorts}
                className={cn('size-9 shrink-0', CONTROL_QUIET)}
              >
                ↻
              </Button>
              {/* baudRate is a number; Radix hands back a string both ways. */}
              <Select
                value={String(settings.baudRate)}
                onValueChange={(v) => updateInfo('baudRate', parseInt(v))}
              >
                <SelectTrigger className={cn(CONTROL, 'w-[92px] shrink-0 grow-0')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAUD_RATES.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Port and baud are fixed-width rather than flexing so this
                  fits without the row wrapping. */}
              <SerialFraming
                dataBits={settings.dataBits ?? 8}
                parity={settings.parity ?? 'none'}
                stopBits={settings.stopBits ?? 1}
                onChange={updateInfo}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <Label className={LABEL}>IP Address &amp; Port</Label>
            <div className="flex gap-2">
              <Input
                className={cn(CONTROL, 'w-[172px] shrink-0 grow-0')}
                value={settings.ipAddress}
                onChange={(e) => updateInfo('ipAddress', e.target.value)}
                onKeyDown={preventEnter}
              />
              <Input
                className={cn(CONTROL, 'w-20')}
                type="number"
                value={settings.port}
                onChange={(e) => updateInfo('port', parseInt(e.target.value))}
                onKeyDown={preventEnter}
              />
            </div>
          </div>
        )}
      </div>
      {/* --primary's only consumer in the whole app. shadcn's
          disabled:opacity-50 supersedes the old opacity: 0.7 — accepted drift,
          since pixel identity is an explicit Non-Goal. */}
      {/* Status is otherwise only inferable from the button's label, which
          cannot distinguish "never connected" from "dropped with an error". */}
      <span
        title={connError ?? (connected ? 'Connected' : 'Not connected')}
        className="mb-2.5 flex shrink-0 items-center gap-1.5 self-end text-[11px] font-semibold text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            connected ? 'bg-success' : connError ? 'bg-destructive' : 'bg-faint'
          )}
        />
        {connected ? 'Online' : connError ? 'Error' : 'Offline'}
      </span>
      <Button
        onClick={onConnect}
        disabled={sending}
        className={cn(
          'w-30 font-semibold',
          connected && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        )}
      >
        {sending ? '...' : connected ? 'Disconnect' : 'Connect'}
      </Button>
    </div>
  )
}

export default SettingsBar
