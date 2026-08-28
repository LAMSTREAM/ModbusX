import React from 'react'
import type { DataFormat } from '../lib/modbus-config'

export interface DataMonitorProps {
  dataFormat: DataFormat
  setDataFormat: (f: DataFormat) => void
  /** `showLogs` — drives the flex 2 vs 1 split against the log pane. */
  expanded: boolean
  /** The memoized grid element, built in ModbusDebugger. */
  children: React.ReactNode
}

const DataMonitor: React.FC<DataMonitorProps> = ({
  dataFormat,
  setDataFormat,
  expanded,
  children
}) => {
  return (
    <div
      style={{
        flex: expanded ? 2 : 1,
        transition: 'flex 0.3s',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0',
        border: '1px solid var(--c-border)',
        borderRadius: '8px',
        background: 'var(--c-bg-mute)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--c-bg)',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--c-text)' }}>
          Data Monitor
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['DEC_U', 'DEC_S', 'UINT32', 'HEX', 'FLOAT', 'ASCII'] as DataFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setDataFormat(f)}
              style={{
                background: dataFormat === f ? 'var(--c-border)' : 'transparent',
                color: dataFormat === f ? 'var(--c-text)' : 'var(--c-text-sub)',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{children}</div>
    </div>
  )
}

export default DataMonitor
