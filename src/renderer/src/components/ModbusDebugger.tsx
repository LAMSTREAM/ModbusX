import React, { useState, useEffect, useRef } from 'react'
import { ConnectionSettings, ModbusRawLog } from '../../../modbus/modbus'

// --- Constants ---
const STORAGE_KEY = 'modbus_debugger_config_v17'

const BAUD_RATES = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 56000, 57600, 115200, 128000, 256000
]

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

// --- Types ---
interface LogItem {
  id: number
  time: string
  dir: 'TX' | 'RX' | 'SYS'
  msg: string
  detail?: string
}

type DataFormat = 'HEX' | 'DEC_U' | 'DEC_S' | 'UINT32' | 'ASCII' | 'FLOAT'
type AddressFormat = 'HEX' | 'DEC'

interface SavedConfig {
  settings: ConnectionSettings
  standardFc: string
  customFcValue: string
  address: string
  addrFormat: AddressFormat
  countParam: string
  dataFormat: DataFormat
  customFcMode: boolean
  showLogs: boolean
}

// --- Helpers ---

const loadConfig = (): SavedConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }
    }
  } catch (e) {
    console.error(e)
  }
  return {
    settings: DEFAULT_SETTINGS,
    standardFc: '3',
    customFcValue: '',
    address: '0',
    addrFormat: 'DEC',
    countParam: '10',
    dataFormat: 'DEC_U',
    customFcMode: false,
    showLogs: true
  }
}

const minDelay = async <T,>(promise: Promise<T>, ms = 1000): Promise<T> => {
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

const parseFC = (input: string): number => {
  const s = String(input).trim()
  if (s.toLowerCase().startsWith('0x')) return parseInt(s, 16)
  return parseInt(s, 10)
}

// --- Register Block ---
interface RegisterBlockProps {
  address: number
  value: number
  nextValue?: number
  format: DataFormat
  addrFormat: AddressFormat
  onEdit: (addr: number, newVal: string) => void
}

const RegisterBlock: React.FC<RegisterBlockProps> = ({
  address,
  value,
  nextValue,
  format,
  addrFormat,
  onEdit
}) => {
  const [editingVal, setEditingVal] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)

  const getDisplayValue = () => {
    switch (format) {
      case 'HEX':
        return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
      case 'DEC_S':
        return (value > 32767 ? value - 65536 : value).toString()
      case 'UINT32': {
        const u32 = ((value << 16) | (nextValue || 0)) >>> 0
        return u32.toString()
      }

      case 'FLOAT': {
        const buf = new ArrayBuffer(4)
        const view = new DataView(buf)
        view.setUint16(0, value, false)
        view.setUint16(2, nextValue || 0, false)
        return view.getFloat32(0, false).toFixed(4)
      }

      case 'ASCII': {
        const hi = (value >> 8) & 0xff
        const lo = value & 0xff
        return (
          (hi > 31 && hi < 127 ? String.fromCharCode(hi) : '.') +
          (lo > 31 && lo < 127 ? String.fromCharCode(lo) : '.')
        )
      }

      case 'DEC_U':
      default:
        return value.toString()
    }
  }

  const isReadOnly = format === 'FLOAT' || format === 'UINT32' || format === 'ASCII'
  const displayVal = isEditing ? editingVal : getDisplayValue()

  const handleFocus = () => {
    if (isReadOnly) return
    setIsEditing(true)
    if (format === 'HEX' && !value.toString(16).startsWith('0x')) {
      setEditingVal(`0x${value.toString(16).toUpperCase().padStart(4, '0')}`)
    } else {
      setEditingVal(value.toString())
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingVal(e.target.value)
  }

  const handleBlur = () => {
    if (isEditing) {
      onEdit(address, editingVal)
      setIsEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div
      onClick={() => {
        if (!isEditing && !isReadOnly) handleFocus()
      }}
      style={{
        background: isEditing ? '#fff' : '#f8f9fa',
        border: isEditing ? '1px solid #2563eb' : '1px solid #e9ecef',
        borderRadius: '4px',
        padding: '4px 2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'all 0.1s',
        position: 'relative',
        minWidth: '60px',
        cursor: isReadOnly ? 'default' : 'text'
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: '#adb5bd',
          marginBottom: '2px',
          fontFamily: 'monospace',
          userSelect: 'none'
        }}
      >
        {isReadOnly
          ? `${formatAddress(address, addrFormat)}..`
          : formatAddress(address, addrFormat)}
      </div>
      <input
        value={displayVal}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        readOnly={isReadOnly}
        style={{
          width: '100%',
          textAlign: 'center',
          border: 'none',
          background: 'transparent',
          fontWeight: 600,
          color: isEditing ? '#000' : isReadOnly ? '#2563eb' : '#495057',
          outline: 'none',
          fontSize: '13px',
          fontFamily: 'monospace',
          pointerEvents: isReadOnly ? 'none' : 'auto'
        }}
      />
    </div>
  )
}

// --- Main Component ---
const ModbusDebugger: React.FC = () => {
  const initialConfig = loadConfig()

  const [settings, setSettings] = useState<ConnectionSettings>(initialConfig.settings)
  const [ports, setPorts] = useState<{ path: string }[]>([])
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)

  // FC State Separation
  const [standardFc, setStandardFc] = useState<string>(initialConfig.standardFc || '3')
  const [customFcValue, setCustomFcValue] = useState<string>(initialConfig.customFcValue || '')

  const [customFcMode, setCustomFcMode] = useState(initialConfig.customFcMode)
  const [address, setAddress] = useState<string>(initialConfig.address)
  const [addrFormat, setAddrFormat] = useState<AddressFormat>(initialConfig.addrFormat)
  const [countParam, setCountParam] = useState<string>(initialConfig.countParam)
  const [autoRead, setAutoRead] = useState(false)

  const [monitorData, setMonitorData] = useState<{ startAddr: number; values: number[] } | null>(
    null
  )
  const [dataFormat, setDataFormat] = useState<DataFormat>(initialConfig.dataFormat)

  const [logs, setLogs] = useState<LogItem[]>([])
  const [showLogs, setShowLogs] = useState(initialConfig.showLogs)
  const [devMode, setDevMode] = useState(false)

  const logListRef = useRef<HTMLDivElement>(null)

  // Derived effective FC
  const effectiveFc = customFcMode ? customFcValue : standardFc

  // --- Auto Save ---
  useEffect(() => {
    const config: SavedConfig = {
      settings,
      standardFc,
      customFcValue,
      address,
      addrFormat,
      countParam,
      dataFormat,
      customFcMode,
      showLogs
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [
    settings,
    standardFc,
    customFcValue,
    address,
    addrFormat,
    countParam,
    dataFormat,
    customFcMode,
    showLogs
  ])

  const addLog = (dir: 'TX' | 'RX' | 'SYS', msg: string, detail?: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Date.now(), time: new Date().toLocaleTimeString(), dir, msg, detail }
    ])
  }

  useEffect(() => {
    if (!window.modbusAPI) return addLog('SYS', 'Fatal: modbusAPI missing')
    const unsubscribe = window.modbusAPI.subscribeRawLog((log: ModbusRawLog) => {
      const ts = new Date(log.timestamp).toLocaleTimeString()
      if (log.tx) addLog('TX', `[${ts}] ${buf2hex(log.tx)}`)
      if (log.rx) addLog('RX', `[${ts}] ${buf2hex(log.rx)}`)
    })
    return () => window.modbusAPI.unsubscribeRawLog(unsubscribe)
  }, [])

  useEffect(() => {
    if (settings.mode === 'RTU') scanPorts()
  }, [settings.mode])

  // Scroll Logs (Only if showing)
  useEffect(() => {
    if (showLogs && logListRef.current)
      logListRef.current.scrollTop = logListRef.current.scrollHeight
  }, [logs, showLogs])

  // Define handleCommand here for useEffect dependency
  const handleCommand = (silent = false) => {
    const fcNum = parseFC(effectiveFc)
    if ([1, 2, 3, 4].includes(fcNum)) {
      handleRead(silent)
    } else {
      if (!silent) addLog('SYS', `Command FC:${fcNum} (Auto-read skip)`, undefined)
    }
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRead && connected && !sending) {
      interval = setInterval(() => {
        const fcNum = parseFC(effectiveFc)
        if (fcNum >= 1 && fcNum <= 4) {
          handleCommand(false)
        }
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [autoRead, connected, effectiveFc, address, countParam, addrFormat, settings, sending])

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

  const handleInputEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (customFcMode) handleCommand(false)
      else handleRead(false)
    }
  }

  const handleCellEdit = (addr: number, newVal: string) => {
    if (!monitorData) return
    let num = NaN
    const s = newVal.trim()
    if (s.toLowerCase().startsWith('0x')) num = parseInt(s, 16)
    else if (dataFormat === 'HEX' && /^[0-9A-Fa-f]+$/.test(s)) num = parseInt(s, 16)
    else num = parseInt(s, 10)

    if (!isNaN(num)) {
      const index = addr - monitorData.startAddr
      if (index >= 0 && index < monitorData.values.length) {
        const newValues = [...monitorData.values]
        newValues[index] = num
        setMonitorData({ ...monitorData, values: newValues })
      }
    }
  }

  // --- 1. READ ACTION ---
  const handleRead = async (silent = false) => {
    if (sending) return

    try {
      const base = addrFormat === 'HEX' ? 16 : 10
      const addrNum = parseInt(address, base)
      let fcNum = parseFC(effectiveFc)
      // Standard mode force Read FC
      if (!customFcMode && ![1, 2, 3, 4].includes(fcNum)) fcNum = 3

      const count = parseInt(countParam, 10) || 10
      if (isNaN(addrNum)) throw new Error('Invalid Address')

      if (!silent) setSending(true)
      const addrStr = formatAddress(addrNum, addrFormat)

      const execute = async () => {
        const res = await window.modbusAPI.read({
          functionCode: fcNum as any,
          address: addrNum,
          count: count
        })
        const numValues = res.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
        setMonitorData({ startAddr: addrNum, values: numValues })
        if (!silent) addLog('SYS', `Read ${res.length} items from ${addrStr}`)
      }

      if (!silent) await minDelay(execute())
      else await execute()
    } catch (e: any) {
      addLog('SYS', 'Read Error', e.stack || e.message)
    } finally {
      if (!silent) setSending(false)
    }
  }

  // --- 2. WRITE ACTION ---
  const handleWrite = async () => {
    if (sending) return

    try {
      const base = addrFormat === 'HEX' ? 16 : 10
      const startAddr = parseInt(address, base)
      const count = parseInt(countParam, 10) || 1
      const fcNum = parseFC(effectiveFc)

      if (isNaN(startAddr)) throw new Error('Invalid Address')
      if (!monitorData) throw new Error('No data. Please Read first.')

      const valuesToWrite: number[] = []
      for (let i = 0; i < count; i++) {
        const target = startAddr + i
        const idx = target - monitorData.startAddr
        if (idx < 0 || idx >= monitorData.values.length) {
          throw new Error(
            `Data missing for ${formatAddress(target, addrFormat)}. Check Monitor range.`
          )
        }
        valuesToWrite.push(monitorData.values[idx])
      }

      setSending(true)
      const addrStr = formatAddress(startAddr, addrFormat)
      const fcStr = `FC:${fcNum} (0x${fcNum.toString(16).toUpperCase()})`

      const execute = async () => {
        try {
          let writeFC = fcNum
          // Auto switch standard read FC to write FC
          if (!customFcMode && [1, 2, 3, 4].includes(fcNum)) {
            writeFC = count === 1 ? 6 : 16
          }
          const payload = count === 1 ? valuesToWrite[0] : valuesToWrite

          await window.modbusAPI.write({
            functionCode: writeFC as number,
            address: startAddr,
            values: payload
          })
          addLog('SYS', `${fcStr} Write OK to ${addrStr} (Len:${valuesToWrite.length})`)
        } catch (err: any) {
          addLog('SYS', `Write Warning: ${err.message}`)
        }

        // Auto Refresh
        if (connected) {
          try {
            const readFc = fcNum === 5 || fcNum === 15 ? 1 : 3
            const refreshRes = await window.modbusAPI.read({
              functionCode: readFc as any,
              address: startAddr,
              count: count
            })
            const refreshValues = refreshRes.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
            const newValues = [...monitorData.values]
            refreshValues.forEach((val, i) => {
              const idx = startAddr - monitorData.startAddr + i
              if (idx >= 0 && idx < newValues.length) newValues[idx] = val
            })
            setMonitorData({ ...monitorData, values: newValues })
          } catch (refreshErr) {}
        }
      }

      await minDelay(execute())
    } catch (e: any) {
      addLog('SYS', 'Write Error', e.message)
    } finally {
      setSending(false)
    }
  }

  // --- Main Button Logic ---
  const handleMainAction = () => {
    const fcNum = parseFC(effectiveFc)
    if (!customFcMode) {
      if ([6, 16].includes(fcNum)) handleWrite()
      else handleRead(false)
    } else {
      if ([1, 2, 3, 4].includes(fcNum)) handleRead(false)
      else handleWrite()
    }
  }

  const preventEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') e.preventDefault()
  }
  const updateInfo = (k: keyof ConnectionSettings, v: any) => setSettings((p) => ({ ...p, [k]: v }))

  const currentFC = parseFC(effectiveFc)
  const isReadOp = [1, 2, 3, 4].includes(currentFC)
  const isWriteAction = !customFcMode ? [6, 16].includes(currentFC) : !isReadOp
  const isFloatMode = dataFormat === 'FLOAT' || dataFormat === 'UINT32'

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    height: '100%',
    width: '100%',
    padding: '20px',
    boxSizing: 'border-box',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
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
    color: '#495057',
    marginBottom: '6px',
    display: 'block'
  }
  const rowStyle = {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    flexWrap: 'wrap' as const
  }
  const flexFixed = (w: string) => ({ flex: `0 0 ${w}` })
  const flexGrow = { flex: '1 1 120px' }

  return (
    <div style={containerStyle}>
      {/* 1. Connection Section */}
      <div style={rowStyle}>
        <div style={flexFixed('90px')}>
          <span style={labelStyle}>Mode</span>
          <select
            style={{ ...inputBase, width: '100%', padding: '0 8px' }}
            value={settings.mode}
            onChange={(e) => updateInfo('mode', e.target.value)}
          >
            <option value="RTU">RTU</option>
            <option value="TCP">TCP</option>
          </select>
        </div>

        <div style={flexFixed('80px')}>
          <span style={labelStyle}>Slave ID</span>
          <input
            style={{ ...inputBase, width: '100%', padding: '0 10px' }}
            type="number"
            value={settings.slaveId}
            onChange={(e) => updateInfo('slaveId', parseInt(e.target.value))}
            onKeyDown={preventEnter}
          />
        </div>

        <div style={{ flex: '1 1 300px' }}>
          {settings.mode === 'RTU' ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={labelStyle}>Serial Port & Baud</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  style={{ ...inputBase, flex: 1, minWidth: '150px', padding: '0 8px' }}
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
                    cursor: 'pointer',
                    background: '#f8f9fa',
                    padding: 0
                  }}
                  title="Refresh Ports"
                >
                  ↻
                </button>
                <select
                  style={{ ...inputBase, width: '100px', flex: '0 0 auto', padding: '0 8px' }}
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
                  style={{ ...inputBase, flex: 1, minWidth: '150px', padding: '0 10px' }}
                  placeholder="127.0.0.1"
                  value={settings.ipAddress}
                  onChange={(e) => updateInfo('ipAddress', e.target.value)}
                  onKeyDown={preventEnter}
                />
                <input
                  style={{ ...inputBase, width: '80px', padding: '0 10px' }}
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
            ...inputBase,
            width: '140px',
            fontWeight: 600,
            cursor: sending ? 'wait' : 'pointer',
            background: connected ? '#ef4444' : '#18181b',
            color: '#fff',
            border: 'none',
            opacity: sending ? 0.7 : 1
          }}
        >
          {sending ? '...' : connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* 2. Command Section */}
      <div style={rowStyle}>
        {/* Function Code */}
        <div style={flexFixed('220px')}>
          <span style={labelStyle}>Function</span>
          <div style={{ display: 'flex' }}>
            {customFcMode ? (
              <input
                style={{
                  ...inputBase,
                  width: '150px',
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  borderRight: 'none',
                  padding: '0 10px'
                }}
                type="text"
                value={customFcValue}
                onChange={(e) => setCustomFcValue(e.target.value)}
                onKeyDown={handleInputEnter}
                placeholder="FC (e.g. 0x06)"
              />
            ) : (
              <select
                style={{
                  ...inputBase,
                  width: '150px',
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  borderRight: 'none',
                  padding: '0 8px'
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
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                background: '#f8f9fa',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                color: '#495057',
                padding: 0
              }}
            >
              {customFcMode ? 'Custom' : 'Standard'}
            </button>
          </div>
        </div>

        {/* Address */}
        <div style={flexGrow}>
          <span style={labelStyle}>Address ({addrFormat})</span>
          <div style={{ display: 'flex' }}>
            <input
              style={{
                ...inputBase,
                width: '100%',
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: 'none',
                fontFamily: 'monospace',
                padding: '0 10px'
              }}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={handleInputEnter}
              placeholder={addrFormat === 'HEX' ? 'F040' : '0'}
            />
            <button
              onClick={toggleAddrFormat}
              style={{
                ...inputBase,
                width: '50px',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                background: '#f8f9fa',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                color: '#495057',
                padding: 0
              }}
            >
              {addrFormat}
            </button>
          </div>
        </div>

        {/* Count */}
        <div style={flexFixed('100px')}>
          <span style={labelStyle}>Count</span>
          <input
            style={{ ...inputBase, width: '100%', fontFamily: 'monospace', padding: '0 10px' }}
            value={countParam}
            onChange={(e) => setCountParam(e.target.value)}
            onKeyDown={handleInputEnter}
            placeholder="10"
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isWriteAction && (
            <button
              onClick={() => setAutoRead(!autoRead)}
              disabled={!connected}
              style={{
                ...inputBase,
                width: '80px',
                fontWeight: 600,
                border: 'none',
                cursor: !connected ? 'not-allowed' : 'pointer',
                background: autoRead ? '#10b981' : '#f8f9fa',
                color: autoRead ? '#fff' : '#18181b',
                opacity: !connected ? 0.5 : 1
              }}
            >
              {autoRead ? 'Stop' : 'Auto'}
            </button>
          )}

          <button
            onClick={handleMainAction}
            disabled={!connected || sending || (isWriteAction && isFloatMode)}
            style={{
              ...inputBase,
              width: '100px',
              fontWeight: 600,
              border: 'none',
              cursor:
                !connected || sending || (isWriteAction && isFloatMode) ? 'not-allowed' : 'pointer',
              background: isWriteAction ? '#d97706' : '#2563eb',
              color: '#fff',
              opacity: !connected || sending || (isWriteAction && isFloatMode) ? 0.5 : 1
            }}
          >
            {sending ? '...' : isWriteAction ? 'Write' : 'Read'}
          </button>
        </div>
      </div>

      {/* 3. Data Monitor (Flex Grow) */}
      <div
        style={{
          flex: showLogs ? 2 : 1,
          transition: 'flex 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '0',
          border: '1px solid #e4e4e7',
          borderRadius: '8px',
          background: '#fafafa',
          overflow: 'hidden'
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
            {(['DEC_U', 'DEC_S', 'UINT32', 'HEX', 'FLOAT', 'ASCII'] as DataFormat[]).map((f) => (
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
              {monitorData.values.map((val, idx) => {
                const is32Bit = dataFormat === 'FLOAT' || dataFormat === 'UINT32'
                if (is32Bit && idx % 2 !== 0) return null

                const currentAddr = monitorData.startAddr + idx
                return (
                  <RegisterBlock
                    key={currentAddr}
                    address={currentAddr}
                    value={val}
                    nextValue={monitorData.values[idx + 1]}
                    format={dataFormat}
                    addrFormat={addrFormat}
                    onEdit={handleCellEdit}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Log Monitor */}
      <div
        style={{
          flex: showLogs ? 1 : '0 0 32px',
          transition: 'flex 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          border: '1px solid #e4e4e7',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff'
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
