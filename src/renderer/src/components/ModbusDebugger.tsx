import React, { useState, useEffect, useRef } from 'react'
import { ConnectionSettings, ModbusRawLog } from '../../../modbus/modbus'

// --- Constants & Types ---
const DEFAULT_SETTINGS: ConnectionSettings = {
  mode: 'RTU',
  slaveId: 1,
  timeout: 1000,
  ipAddress: '127.0.0.1',
  port: 502,
  serialPort: '',
  baudRate: 115200,
  dataBits: 8,
  parity: 'none',
  stopBits: 1
}

interface LogItem {
  id: number
  time: string
  dir: 'TX' | 'RX' | 'SYS'
  msg: string
  detail?: string
}

type DataFormat = 'HEX' | 'DEC_U' | 'DEC_S' | 'ASCII' | 'FLOAT'
type AddressFormat = 'HEX' | 'DEC'

// --- Helpers ---

const minDelay = async <T,>(promise: Promise<T>, ms = 300): Promise<T> => {
  const [res] = await Promise.all([promise, new Promise((r) => setTimeout(r, ms))])
  return res
}

const formatAddress = (addr: number, fmt: AddressFormat) => {
  return fmt === 'HEX' ? `${addr.toString(16).toUpperCase().padStart(4, '0')}` : addr.toString()
}

const buf2hex = (buf?: Uint8Array) =>
  buf
    ? Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')
    : ''

// --- Sub-Component: Register Block ---
interface RegisterBlockProps {
  address: number
  value: number
  nextValue?: number
  format: DataFormat
  addrFormat: AddressFormat
  onWrite: (addr: number, val: number) => Promise<void>
}

const RegisterBlock: React.FC<RegisterBlockProps> = ({
  address,
  value,
  nextValue,
  format,
  addrFormat,
  onWrite
}) => {
  const [editingVal, setEditingVal] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const getDisplayValue = () => {
    switch (format) {
      case 'HEX':
        return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
      case 'DEC_S':
        return (value > 32767 ? value - 65536 : value).toString()
      case 'ASCII':
        const hi = (value >> 8) & 0xff
        const lo = value & 0xff
        return (
          (hi > 31 && hi < 127 ? String.fromCharCode(hi) : '.') +
          (lo > 31 && lo < 127 ? String.fromCharCode(lo) : '.')
        )
      case 'FLOAT':
        const buf = new ArrayBuffer(4)
        const view = new DataView(buf)
        view.setUint16(0, value, false)
        view.setUint16(2, nextValue || 0, false)
        return view.getFloat32(0, false).toFixed(4)
      case 'DEC_U':
      default:
        return value.toString()
    }
  }

  const handleFocus = () => {
    if (format === 'FLOAT') return
    setIsEditing(true)
    setEditingVal(format === 'HEX' ? value.toString(16) : value.toString())
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') await commitWrite()
    if (e.key === 'Escape') setIsEditing(false)
  }

  const commitWrite = async () => {
    setLoading(true)
    try {
      let num = 0
      const s = editingVal.trim()
      if (s.toLowerCase().startsWith('0x')) num = parseInt(s, 16)
      else num = parseInt(s, 10)

      await onWrite(address, num)
      setIsEditing(false)
    } catch (e) {
      // Error handled by parent
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: isEditing ? '#fff' : '#f4f4f5',
        border: isEditing ? '1px solid #18181b' : '1px solid #e4e4e7',
        borderRadius: '4px',
        padding: '4px 2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'all 0.1s',
        position: 'relative',
        minWidth: '60px'
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: '#a1a1aa',
          marginBottom: '2px',
          fontFamily: 'monospace',
          userSelect: 'none'
        }}
      >
        {format === 'FLOAT'
          ? `${formatAddress(address, addrFormat)}.`
          : formatAddress(address, addrFormat)}
      </div>

      <input
        value={isEditing ? editingVal : getDisplayValue()}
        onFocus={handleFocus}
        onBlur={() => setIsEditing(false)}
        onChange={(e) => setEditingVal(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={format === 'FLOAT'}
        disabled={loading}
        title={format === 'FLOAT' ? 'Float editing disabled' : 'Click to edit'}
        style={{
          width: '100%',
          textAlign: 'center',
          border: 'none',
          background: 'transparent',
          fontWeight: 600,
          color: isEditing ? '#000' : format === 'FLOAT' ? '#2563eb' : '#18181b',
          outline: 'none',
          fontSize: '13px',
          fontFamily: 'monospace',
          cursor: format === 'FLOAT' ? 'default' : 'text'
        }}
      />
    </div>
  )
}

// --- Main Component ---
const ModbusDebugger: React.FC = () => {
  // Connection State
  const [settings, setSettings] = useState<ConnectionSettings>(DEFAULT_SETTINGS)
  const [ports, setPorts] = useState<{ path: string }[]>([])
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)

  // Command State
  const [fc, setFc] = useState<number>(3)
  const [address, setAddress] = useState<string>('0')
  const [addrFormat, setAddrFormat] = useState<AddressFormat>('DEC')
  const [valParam, setValParam] = useState<string>('10')
  const [autoRead, setAutoRead] = useState(false)

  // Monitor State
  const [monitorData, setMonitorData] = useState<{ startAddr: number; values: number[] } | null>(
    null
  )
  const [dataFormat, setDataFormat] = useState<DataFormat>('DEC_U')

  // Log State
  const [logs, setLogs] = useState<LogItem[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [devMode, setDevMode] = useState(false)

  const logListRef = useRef<HTMLDivElement>(null)

  // --- Helpers ---
  const addLog = (dir: 'TX' | 'RX' | 'SYS', msg: string, detail?: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Date.now(), time: new Date().toLocaleTimeString(), dir, msg, detail }
    ])
  }

  // --- Effects ---
  useEffect(() => {
    if (!window.modbusAPI) return addLog('SYS', 'Fatal: modbusAPI missing')
    const unsubscribe = window.modbusAPI.subscribeRawLog((log: ModbusRawLog) => {
      const ts = new Date(log.timestamp).toLocaleTimeString()
      if (log.tx) addLog('TX', `[${ts}] ${buf2hex(log.tx)}`)
      if (log.rx) addLog('RX', `[${ts}] ${buf2hex(log.rx)}`)
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return () => window.modbusAPI.unsubscribeRawLog(unsubscribe)
  }, [])

  useEffect(() => {
    if (settings.mode === 'RTU') scanPorts()
  }, [settings.mode])

  useEffect(() => {
    if (showLogs && logListRef.current) {
      const { current } = logListRef
      current.scrollTop = current.scrollHeight
    }
  }, [logs, showLogs])

  // Auto Read Interval
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRead && connected && !sending) {
      interval = setInterval(() => {
        if (fc >= 1 && fc <= 4) {
          handleCommand(true)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [autoRead, connected, fc, address, valParam, addrFormat, settings, sending])

  // --- Handlers ---
  const scanPorts = async () => {
    try {
      const list = await window.modbusAPI.scanSerialPorts()
      setPorts(list)
      if (list.length > 0 && !settings.serialPort) updateInfo('serialPort', list[0].path)
    } catch (e: any) {
      addLog('SYS', 'Scan Error', e.message)
    }
  }

  const handleConnect = async () => {
    if (connected) {
      setSending(true)
      try {
        await minDelay(window.modbusAPI.disconnect())
        setConnected(false)
        setAutoRead(false)
        addLog('SYS', 'Disconnected')
      } catch (e: any) {
        addLog('SYS', 'Disconnect Failed', e.message)
      } finally {
        setSending(false)
      }
    } else {
      if (settings.mode === 'RTU' && !settings.serialPort) return alert('Select Port')
      setSending(true)
      try {
        await minDelay(window.modbusAPI.connect(settings))
        setConnected(true)
        addLog('SYS', 'Connected')
      } catch (e: any) {
        setConnected(false)
        addLog('SYS', 'Connection Failed', e.message)
      } finally {
        setSending(false)
      }
    }
  }

  const toggleAddrFormat = () => {
    const currentBase = addrFormat === 'HEX' ? 16 : 10
    const val = parseInt(address, currentBase)
    const nextFmt = addrFormat === 'HEX' ? 'DEC' : 'HEX'
    setAddrFormat(nextFmt)

    if (isNaN(val)) setAddress('0')
    else setAddress(nextFmt === 'HEX' ? val.toString(16).toUpperCase() : val.toString(10))
  }

  const handleCommand = async (silent = false) => {
    if (sending) return

    try {
      const base = addrFormat === 'HEX' ? 16 : 10
      const addrNum = parseInt(address, base)
      if (isNaN(addrNum)) throw new Error('Invalid Address')

      if (!silent) setSending(true)

      const isRead = [1, 2, 3, 4].includes(fc)
      const addrStr = formatAddress(addrNum, addrFormat)

      const execute = async () => {
        if (isRead) {
          const res = await window.modbusAPI.read({
            functionCode: fc as any,
            address: addrNum,
            count: parseInt(valParam, 10) || 1
          })
          const numValues = res.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
          setMonitorData({ startAddr: addrNum, values: numValues })
          addLog(
            'SYS',
            `Read ${res.length} items from ${addrFormat === 'HEX' ? '0x' : ''}${addrStr}`
          )
        } else {
          let values: any
          const normalized = valParam.replace(/，/g, ',')
          if (normalized.includes(',') || normalized.startsWith('[')) {
            values = JSON.parse(normalized.startsWith('[') ? normalized : `[${normalized}]`)
          } else {
            values = Number(normalized)
          }
          await window.modbusAPI.write({
            functionCode: fc as any,
            address: addrNum,
            values: values
          })
          addLog('SYS', `Write OK to ${addrFormat === 'HEX' ? '0x' : ''}${addrStr}`)

          if (monitorData) {
            const writeVals = Array.isArray(values) ? values : [values]
            const start = monitorData.startAddr
            const end = start + monitorData.values.length
            if (addrNum >= start && addrNum < end) {
              const newValues = [...monitorData.values]
              writeVals.forEach((v: number, i: number) => {
                const targetIdx = addrNum - start + i
                if (targetIdx >= 0 && targetIdx < newValues.length) {
                  newValues[targetIdx] = v
                }
              })
              setMonitorData({ ...monitorData, values: newValues })
            }
          }
        }
      }

      if (!silent) {
        await minDelay(execute())
      } else {
        await execute()
      }
    } catch (e: any) {
      addLog('SYS', 'Command Error', e.stack || e.message)
      if (silent) setAutoRead(false) // Stop auto read on error
    } finally {
      if (!silent) setSending(false)
    }
  }

  const handleCellWrite = async (targetAddr: number, val: number) => {
    try {
      setSending(true)
      const writeFc = fc === 1 || fc === 2 ? 5 : 6
      await minDelay(
        window.modbusAPI.write({ functionCode: writeFc, address: targetAddr, values: val })
      )
      addLog('SYS', `Cell Write OK: ${formatAddress(targetAddr, addrFormat)} -> ${val}`)

      if (monitorData) {
        const index = targetAddr - monitorData.startAddr
        if (index >= 0 && index < monitorData.values.length) {
          const newValues = [...monitorData.values]
          newValues[index] = val
          setMonitorData({ ...monitorData, values: newValues })
        }
      }
    } catch (e: any) {
      addLog('SYS', 'Cell Write Failed', e.message)
      throw e
    } finally {
      setSending(false)
    }
  }

  const preventEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') e.preventDefault()
  }

  const updateInfo = (k: keyof ConnectionSettings, v: any) => setSettings((p) => ({ ...p, [k]: v }))

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    width: '100%',
    padding: '24px',
    boxSizing: 'border-box',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '100%',
    margin: '0 auto'
  }

  const inputBase = {
    padding: '0 10px',
    height: '36px',
    borderRadius: '6px',
    border: '1px solid #e4e4e7',
    fontSize: '13px',
    color: '#18181b',
    background: '#fff',
    transition: 'border 0.2s',
    boxSizing: 'border-box' as const
  }
  const labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#18181b',
    marginBottom: '6px',
    display: 'block'
  }
  const selectStyle = {
    ...inputBase,
    appearance: 'none' as const,
    backgroundImage:
      'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2318181b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '8px',
    paddingRight: '24px'
  }

  // Responsive flex items
  const flexItemSmall = { flex: '0 0 auto', minWidth: '80px' }
  const flexItemGrow = { flex: '1 1 auto', minWidth: '140px' }

  return (
    <div style={containerStyle}>
      {/* 1. Connection Section */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={flexItemSmall}>
          <span style={labelStyle}>Mode</span>
          <select
            style={{ ...selectStyle, width: '100%' }}
            value={settings.mode}
            onChange={(e) => updateInfo('mode', e.target.value)}
          >
            <option value="RTU">RTU</option>
            <option value="TCP">TCP</option>
          </select>
        </div>

        <div style={flexItemSmall}>
          <span style={labelStyle}>Slave ID</span>
          <input
            style={{ ...inputBase, width: '70px' }}
            type="number"
            value={settings.slaveId}
            onChange={(e) => updateInfo('slaveId', parseInt(e.target.value))}
            onKeyDown={preventEnter}
          />
        </div>

        <div style={{ flex: 1, minWidth: '280px' }}>
          {settings.mode === 'RTU' ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Serial Port & Baud</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  style={{ ...selectStyle, flex: 1, minWidth: '150px' }}
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
                    cursor: 'pointer',
                    background: '#f4f4f5',
                    flex: '0 0 auto'
                  }}
                  title="Refresh Ports"
                >
                  ↻
                </button>

                <select
                  style={{ ...selectStyle, width: '100px', flex: '0 0 auto' }}
                  value={settings.baudRate}
                  onChange={(e) => updateInfo('baudRate', parseInt(e.target.value))}
                >
                  {[9600, 19200, 38400, 115200].map((b) => (
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
                  style={{ ...inputBase, flex: 1, minWidth: '150px' }}
                  placeholder="127.0.0.1"
                  value={settings.ipAddress}
                  onChange={(e) => updateInfo('ipAddress', e.target.value)}
                  onKeyDown={preventEnter}
                />
                <input
                  style={{ ...inputBase, width: '70px', flex: '0 0 auto' }}
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
          onClick={handleConnect}
          disabled={sending}
          style={{
            height: '36px',
            width: '140px', // Fixed width to prevent layout shift
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '13px',
            border: 'none',
            cursor: sending ? 'wait' : 'pointer',
            background: connected ? '#ef4444' : '#18181b',
            color: '#fff',
            opacity: sending ? 0.7 : 1,
            transition: 'background 0.2s',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {sending ? '...' : connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* 2. Command Section */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={flexItemGrow}>
          <span style={labelStyle}>Function</span>
          <select
            style={{ ...selectStyle, width: '100%' }}
            value={fc}
            onChange={(e) => setFc(parseInt(e.target.value))}
          >
            <option value={3}>03 Read Holding</option>
            <option value={4}>04 Read Input</option>
            <option value={1}>01 Read Coils</option>
            <option value={6}>06 Write Single</option>
            <option value={16}>16 Write Multi</option>
          </select>
        </div>

        <div style={flexItemGrow}>
          <span style={labelStyle}>Address ({addrFormat})</span>
          <div style={{ display: 'flex' }}>
            <input
              style={{
                ...inputBase,
                width: '100%',
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: 'none',
                fontFamily: 'monospace'
              }}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={preventEnter}
              placeholder={addrFormat === 'HEX' ? 'F040' : '0'}
            />
            <button
              onClick={toggleAddrFormat}
              title="Toggle Hex/Dec"
              style={{
                ...inputBase,
                width: '50px',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                background: '#f4f4f5',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                color: '#71717a',
                flexShrink: 0
              }}
            >
              {addrFormat}
            </button>
          </div>
        </div>

        <div style={flexItemGrow}>
          <span style={labelStyle}>Count / Value</span>
          <input
            style={{ ...inputBase, width: '100%', fontFamily: 'monospace' }}
            value={valParam}
            onChange={(e) => setValParam(e.target.value)}
            onKeyDown={preventEnter}
            placeholder="10 or [1,2]"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {fc < 5 && (
            <button
              onClick={() => setAutoRead(!autoRead)}
              disabled={!connected}
              style={{
                ...inputBase,
                width: '80px', // Fixed width
                background: autoRead ? '#10b981' : '#f4f4f5',
                color: autoRead ? '#fff' : '#18181b',
                fontWeight: 600,
                cursor: !connected ? 'not-allowed' : 'pointer',
                border: 'none',
                opacity: !connected ? 0.5 : 1,
                flexShrink: 0
              }}
            >
              {autoRead ? 'Stop' : 'Auto'}
            </button>
          )}

          <button
            onClick={() => handleCommand(false)}
            disabled={!connected || sending}
            style={{
              height: '36px',
              width: '100px', // Fixed width to prevent layout shift
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              border: 'none',
              cursor: !connected || sending ? 'not-allowed' : 'pointer',
              background: '#2563eb',
              color: '#fff',
              opacity: !connected || sending ? 0.5 : 1,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {sending ? '...' : fc < 5 ? 'Read' : 'Write'}
          </button>
        </div>
      </div>

      {/* 3. Data Monitor */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '300px',
          border: '1px solid #e4e4e7',
          borderRadius: '8px',
          background: '#fafafa'
        }}
      >
        <div
          style={{
            padding: '8px 16px',
            background: '#fff',
            borderBottom: '1px solid #e4e4e7',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#18181b' }}>Data Monitor</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['DEC_U', 'DEC_S', 'HEX', 'FLOAT', 'ASCII'] as DataFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setDataFormat(f)}
                style={{
                  background: dataFormat === f ? '#e4e4e7' : 'transparent',
                  color: dataFormat === f ? '#000' : '#71717a',
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

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {!monitorData ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a1a1aa'
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊞</div>
              <div style={{ fontSize: '13px' }}>No Data Available</div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                gap: '8px'
              }}
            >
              {monitorData.values.map((val, idx) => (
                <RegisterBlock
                  key={monitorData.startAddr + idx}
                  address={monitorData.startAddr + idx}
                  value={val}
                  nextValue={monitorData.values[idx + 1]}
                  format={dataFormat}
                  addrFormat={addrFormat}
                  onWrite={handleCellWrite}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Log Monitor */}
      <div
        style={{
          height: showLogs ? '250px' : '32px',
          transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          border: '1px solid #e4e4e7',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          flexShrink: 0
        }}
      >
        <div
          style={{
            padding: '0 12px',
            height: '32px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            borderBottom: showLogs ? '1px solid #e4e4e7' : 'none'
          }}
          onClick={() => setShowLogs(!showLogs)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#18181b', fontSize: '11px', fontWeight: 700 }}>SYSTEM LOGS</span>
            {!showLogs && logs.length > 0 && (
              <span
                style={{
                  color: '#71717a',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '300px'
                }}
              >
                — {logs[logs.length - 1].msg}
              </span>
            )}
          </div>
          <div
            style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {showLogs && (
              <>
                <label
                  style={{
                    color: '#71717a',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={devMode}
                    onChange={(e) => setDevMode(e.target.checked)}
                  />
                  Verbose
                </label>
                <button
                  onClick={() => setLogs([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#71717a',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              </>
            )}
            <span style={{ color: '#a1a1aa', fontSize: '10px' }}>{showLogs ? '▼' : '▲'}</span>
          </div>
        </div>

        <div
          ref={logListRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            fontFamily: "'SFMono-Regular', Consolas, monospace",
            fontSize: '12px',
            background: '#fff'
          }}
        >
          {logs.map((l) => (
            <div
              key={l.id}
              style={{ marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}
            >
              <span style={{ color: '#a1a1aa', minWidth: '60px' }}>{l.time}</span>
              <span
                style={{
                  color: l.dir === 'TX' ? '#d97706' : l.dir === 'RX' ? '#059669' : '#ef4444',
                  fontWeight: 700,
                  minWidth: '24px'
                }}
              >
                {l.dir}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#3f3f46' }}>{l.msg}</span>
                {devMode && l.detail && (
                  <div
                    style={{
                      color: '#a1a1aa',
                      marginTop: '2px',
                      whiteSpace: 'pre-wrap',
                      fontSize: '11px'
                    }}
                  >
                    {l.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ModbusDebugger
