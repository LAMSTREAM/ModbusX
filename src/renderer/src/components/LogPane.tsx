import React from 'react'
import type { LogItem } from '../lib/modbus-config'
import { clearBtnStyle } from './section-styles'

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
    <div
      style={{
        flex: showLogs ? 1 : '0 0 32px',
        transition: 'flex 0.3s',
        border: '1px solid var(--c-border)',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-bg)'
      }}
    >
      {/* Header Bar: Click disabled on container */}
      <div
        style={{
          padding: '0 12px',
          height: '32px',
          background: 'var(--c-bg-sub)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: showLogs ? '1px solid var(--c-border)' : 'none',
          cursor: 'default'
        }}
      >
        <span style={{ color: 'var(--c-text)', fontSize: '11px', fontWeight: 700 }}>
          LOGS {logs.length > 0 && !showLogs && `— ${logs[logs.length - 1].msg}`}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Show Raw Toggle */}
          {showLogs && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                color: 'var(--c-text-sub)',
                fontWeight: 600,
                marginRight: '6px'
              }}
            >
              <input
                type="checkbox"
                checked={showRawLog}
                onChange={(e) => setShowRawLog(e.target.checked)}
                style={{ margin: 0, cursor: 'pointer' }}
              />
              Show Raw
            </label>
          )}

          {/* Reverted Clear Button Style */}
          {showLogs && (
            <button onClick={onClear} style={clearBtnStyle}>
              Clear
            </button>
          )}

          {/* Arrow Toggle: Independent Click Area */}
          <div
            onClick={() => setShowLogs(!showLogs)}
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: '4px',
              userSelect: 'none'
            }}
          >
            <span style={{ fontSize: '10px', color: 'var(--c-text-mute)' }}>
              {showLogs ? '▼' : '▲'}
            </span>
          </div>
        </div>
      </div>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}
      >
        {logs.map((l) => (
          <div key={l.id} style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--c-text-mute)', minWidth: '60px' }}>{l.time}</span>
            <span
              style={{
                fontWeight: 700,
                minWidth: '24px',
                color:
                  l.dir === 'TX'
                    ? 'var(--c-tx)'
                    : l.dir === 'RX'
                      ? 'var(--c-rx)'
                      : 'var(--c-danger)'
              }}
            >
              {l.dir}
            </span>
            <span style={{ color: 'var(--c-text-sub)' }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LogPane
