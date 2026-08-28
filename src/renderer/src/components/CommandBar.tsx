import React from 'react'
import type { AddressFormat } from '../lib/modbus-config'
import { parseFC } from '../lib/modbus-format'
import { inputBase, labelStyle, rowStyle, flexFixed, flexGrow } from './section-styles'

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
    <div style={rowStyle}>
      <div style={flexFixed('220px')}>
        <span style={labelStyle}>Function</span>
        <div style={{ display: 'flex' }}>
          {customFcMode ? (
            <input
              style={{
                ...inputBase,
                width: '150px',
                borderRight: 'none',
                borderRadius: '6px 0 0 6px'
              }}
              value={customFcValue}
              onChange={(e) => setCustomFcValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCommand()}
              placeholder="FC (e.g. 0x06)"
            />
          ) : (
            <select
              style={{
                ...inputBase,
                width: '150px',
                borderRight: 'none',
                borderRadius: '6px 0 0 6px'
              }}
              value={standardFc}
              onChange={(e) => setStandardFc(e.target.value)}
            >
              <option value="3">03 Read Holding</option>
              <option value="4">04 Read Input</option>
              <option value="1">01 Read Coils</option>
              <option value="6">06 Write Single</option>
              <option value="16">16 Write Multi</option>
            </select>
          )}
          <button
            onClick={() => setCustomFcMode(!customFcMode)}
            style={{
              ...inputBase,
              width: '70px',
              borderRadius: '0 6px 6px 0',
              background: 'var(--c-bg-cell)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              padding: 0
            }}
          >
            {customFcMode ? 'Custom' : 'Std'}
          </button>
        </div>
      </div>
      <div style={flexGrow}>
        <span style={labelStyle}>Address ({addrFormat})</span>
        <div style={{ display: 'flex' }}>
          <input
            style={{
              ...inputBase,
              width: '100%',
              borderRight: 'none',
              borderRadius: '6px 0 0 6px',
              fontFamily: 'monospace'
            }}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
          />
          <button
            onClick={toggleAddrFormat}
            style={{
              ...inputBase,
              width: '50px',
              borderRadius: '0 6px 6px 0',
              background: 'var(--c-bg-cell)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              padding: 0
            }}
          >
            {addrFormat}
          </button>
        </div>
      </div>
      <div style={flexFixed('100px')}>
        <span style={labelStyle}>Count</span>
        <input
          style={{ ...inputBase, width: '100%', fontFamily: 'monospace' }}
          value={countParam}
          onChange={(e) => setCountParam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onMainAction()}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        {!(!customFcMode && [6, 16].includes(parseFC(effectiveFc))) && (
          <button
            onClick={() => setAutoRead(!autoRead)}
            disabled={!connected}
            style={{
              ...inputBase,
              width: '80px',
              fontWeight: 600,
              border: 'none',
              cursor: !connected ? 'not-allowed' : 'pointer',
              background: autoRead ? 'var(--c-success)' : 'var(--c-bg-cell)',
              color: autoRead ? '#fff' : 'var(--c-text)'
            }}
          >
            {autoRead ? 'Stop' : 'Auto'}
          </button>
        )}
        <button
          onClick={onMainAction}
          disabled={!connected || sending}
          style={{
            ...inputBase,
            width: '100px',
            fontWeight: 600,
            border: 'none',
            cursor: !connected || sending ? 'not-allowed' : 'pointer',
            background: 'var(--c-accent)',
            color: '#fff',
            opacity: !connected || sending ? 0.5 : 1
          }}
        >
          {sending ? '...' : 'Exec'}
        </button>
      </div>
    </div>
  )
}

export default CommandBar
