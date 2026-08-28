import React from 'react'
import { ConnectionSettings, ModbusMode } from '../../../modbus/modbus'
import { BAUD_RATES } from '../lib/modbus-config'
import { inputBase, labelStyle, rowStyle, flexFixed } from './section-styles'

export interface SettingsBarProps {
  settings: ConnectionSettings
  updateInfo: <K extends keyof ConnectionSettings>(k: K, v: ConnectionSettings[K]) => void
  ports: { path: string }[]
  scanPorts: () => void
  connected: boolean
  sending: boolean
  onConnect: () => void
  preventEnter: (e: React.KeyboardEvent) => void
}

const SettingsBar: React.FC<SettingsBarProps> = ({
  settings,
  updateInfo,
  ports,
  scanPorts,
  connected,
  sending,
  onConnect,
  preventEnter
}) => {
  return (
    <div style={rowStyle}>
      <div style={flexFixed('80px')}>
        <span style={labelStyle}>Mode</span>
        <select
          style={{ ...inputBase, width: '100%', padding: '0 8px' }}
          value={settings.mode}
          onChange={(e) => updateInfo('mode', e.target.value as ModbusMode)}
        >
          <option value="RTU">RTU</option>
          <option value="TCP">TCP</option>
        </select>
      </div>
      <div style={flexFixed('70px')}>
        <span style={labelStyle}>Slave ID</span>
        <input
          style={{ ...inputBase, width: '100%' }}
          type="number"
          value={settings.slaveId}
          onChange={(e) => updateInfo('slaveId', parseInt(e.target.value))}
          onKeyDown={preventEnter}
        />
      </div>
      <div style={flexFixed('80px')}>
        <span style={labelStyle}>Timeout</span>
        <input
          style={{ ...inputBase, width: '100%' }}
          type="number"
          placeholder="ms"
          value={settings.timeout}
          onChange={(e) => updateInfo('timeout', parseInt(e.target.value) || 0)}
          onKeyDown={preventEnter}
        />
      </div>
      <div style={{ flex: '1 1 300px' }}>
        {settings.mode === 'RTU' ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>Serial Port & Baud</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ ...inputBase, flex: 1, minWidth: '150px' }}
                value={settings.serialPort}
                onChange={(e) => updateInfo('serialPort', e.target.value)}
              >
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                  </option>
                ))}
              </select>
              <button
                onClick={scanPorts}
                style={{
                  ...inputBase,
                  width: '36px',
                  background: 'var(--c-bg-cell)',
                  padding: 0,
                  cursor: 'pointer'
                }}
              >
                ↻
              </button>
              <select
                style={{ ...inputBase, width: '100px', flex: '0 0 auto' }}
                value={settings.baudRate}
                onChange={(e) => updateInfo('baudRate', parseInt(e.target.value))}
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>IP Address & Port</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...inputBase, flex: 1 }}
                value={settings.ipAddress}
                onChange={(e) => updateInfo('ipAddress', e.target.value)}
                onKeyDown={preventEnter}
              />
              <input
                style={{ ...inputBase, width: '80px' }}
                type="number"
                value={settings.port}
                onChange={(e) => updateInfo('port', parseInt(e.target.value))}
                onKeyDown={preventEnter}
              />
            </div>
          </div>
        )}
      </div>
      <button
        onClick={onConnect}
        disabled={sending}
        style={{
          ...inputBase,
          width: '120px',
          fontWeight: 600,
          cursor: sending ? 'wait' : 'pointer',
          background: connected ? 'var(--c-danger)' : 'var(--c-primary)',
          color: connected ? '#fff' : 'var(--c-primary-fg)',
          border: 'none',
          opacity: sending ? 0.7 : 1
        }}
      >
        {sending ? '...' : connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  )
}

export default SettingsBar
