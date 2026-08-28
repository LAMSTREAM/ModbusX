import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { ConnectionSettings, ModbusMode, ModbusRawLog } from '../../../modbus/modbus'
import BrandMark from './BrandMark'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'

// `window.modbusAPI` is declared once, globally, in modbus.d.ts as `IModbusAPI`.
// Re-declaring a structurally different shape here made the two augmentations
// disagree (TS2717) and collapsed `subscribeRawLog` to `never` at its call site.

// --- Constants ---
const STORAGE_KEY = 'modbus_debugger_config'
const MAX_LOG_ENTRIES = 100

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
  showRawLog: boolean
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
    console.error('Failed to load config:', e)
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
    showLogs: true,
    showRawLog: false
  }
}

const minDelay = async <T,>(promise: Promise<T>, ms = 200): Promise<T> => {
  const [res] = await Promise.all([promise, new Promise((r) => setTimeout(r, ms))])
  return res
}

const formatAddress = (addr: number, fmt: AddressFormat) => {
  return fmt === 'HEX' ? `${addr.toString(16).toUpperCase().padStart(4, '0')}` : addr.toString()
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// Robust Buffer Handling: Handles Uint8Array, Array, and Electron IPC Buffer objects
const buf2hex = (input: unknown) => {
  if (!input) return ''

  let arr: Iterable<number> | ArrayLike<number> = []

  if (input instanceof Uint8Array || Array.isArray(input)) {
    arr = input as ArrayLike<number>
  } else if (typeof input === 'object') {
    const { data } = input as { data?: unknown }
    if (Array.isArray(data)) {
      // Electron IPC serialized Buffer: { type: 'Buffer', data: [...] }
      arr = data as number[]
    } else {
      // Array-like objects
      arr = Array.from(input as ArrayLike<number>)
    }
  }

  return Array.from(arr)
    .map((b) => (b as number).toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

const parseFC = (input: string): number => {
  const s = String(input).trim()
  if (s.toLowerCase().startsWith('0x')) return parseInt(s, 16)
  return parseInt(s, 10)
}

const formatValue = (value: number, nextValue: number | undefined, format: DataFormat): string => {
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

// --- OPTIMIZED SUB-COMPONENT: RegisterBlock ---
interface RegisterBlockProps {
  address: number
  value: number
  nextValue?: number
  format: DataFormat
  addrFormat: AddressFormat
  index: number
  isSelected: boolean
  onSelectionStart: (index: number) => void
  onSelectionEnter: (index: number) => void
  onEdit: (addr: number, newVal: string) => void
}

const RegisterBlock = memo<RegisterBlockProps>(
  ({
    address,
    value,
    nextValue,
    format,
    addrFormat,
    index,
    isSelected,
    onSelectionStart,
    onSelectionEnter,
    onEdit
  }) => {
    const [editingVal, setEditingVal] = useState<string>('')
    const [isEditing, setIsEditing] = useState(false)

    const isReadOnly = format === 'FLOAT' || format === 'UINT32' || format === 'ASCII'
    const displayVal = isEditing ? editingVal : formatValue(value, nextValue, format)

    const is32Bit = format === 'FLOAT' || format === 'UINT32'
    const addressLabel = is32Bit
      ? `${formatAddress(address, addrFormat)}-${formatAddress(address + 1, addrFormat).slice(-2)}`
      : formatAddress(address, addrFormat)

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
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      if (e.key === 'Escape') setIsEditing(false)
    }

    const handleMouseDown = () => onSelectionStart(index)
    const handleMouseEnter = () => onSelectionEnter(index)
    const handleClick = () => {
      if (!isEditing && !isReadOnly) handleFocus()
    }

    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        style={{
          background: isSelected
            ? 'var(--c-select-bg)'
            : isEditing
              ? 'var(--c-bg)'
              : 'var(--c-bg-cell)',
          border: isSelected
            ? '1px solid var(--c-select-border)'
            : isEditing
              ? '1px solid var(--c-accent)'
              : '1px solid var(--c-border)',
          borderRadius: '4px',
          padding: '4px 2px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          minWidth: '60px',
          cursor: 'default',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            fontSize: '10px',
            color: isSelected ? 'var(--c-select-fg)' : 'var(--c-text-mute)',
            marginBottom: '2px',
            fontFamily: 'monospace'
          }}
        >
          {addressLabel}
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
            color: isEditing ? 'var(--c-text)' : isReadOnly ? 'var(--c-accent)' : 'var(--c-text)',
            outline: 'none',
            fontSize: is32Bit ? '14px' : '13px',
            fontFamily: 'monospace',
            pointerEvents: isReadOnly ? 'none' : 'auto'
          }}
        />
      </div>
    )
  },
  (prev, next) => {
    return (
      prev.value === next.value &&
      prev.nextValue === next.nextValue &&
      prev.isSelected === next.isSelected &&
      prev.format === next.format &&
      prev.address === next.address &&
      prev.addrFormat === next.addrFormat
    )
  }
)

RegisterBlock.displayName = 'RegisterBlock'

// --- Main Component ---
const ModbusDebugger: React.FC = () => {
  const initialConfig = loadConfig()
  const { theme, toggleTheme } = useTheme()

  // State
  const [settings, setSettings] = useState<ConnectionSettings>(initialConfig.settings)
  const [ports, setPorts] = useState<{ path: string }[]>([])
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
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

  // Selection State
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const isSelectingRef = useRef(false)

  // Logs
  const [logs, setLogs] = useState<LogItem[]>([])
  const [showLogs, setShowLogs] = useState(initialConfig.showLogs)
  const [showRawLog, setShowRawLog] = useState(initialConfig.showRawLog)
  const showRawLogRef = useRef(initialConfig.showRawLog)
  const logListRef = useRef<HTMLDivElement>(null)
  // `sending` is read from inside interval/async closures, where the state
  // value is stale. The ref is the authoritative busy flag.
  const busyRef = useRef(false)

  const effectiveFc = customFcMode ? customFcValue : standardFc

  useEffect(() => {
    isSelectingRef.current = isSelecting
  }, [isSelecting])
  useEffect(() => {
    showRawLogRef.current = showRawLog
  }, [showRawLog])

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
      showLogs,
      showRawLog
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
    showLogs,
    showRawLog
  ])

  // --- Optimized Logging ---
  const addLog = useCallback((dir: 'TX' | 'RX' | 'SYS', msg: string, detail?: string) => {
    setLogs((prev) => {
      const newLog = { id: Date.now(), time: new Date().toLocaleTimeString(), dir, msg, detail }
      if (prev.length >= MAX_LOG_ENTRIES) {
        return [...prev.slice(1), newLog]
      }
      return [...prev, newLog]
    })
  }, [])

  // Subscribe to raw logs - Robust Logic
  useEffect(() => {
    if (!window.modbusAPI) return addLog('SYS', 'Fatal: modbusAPI missing')

    // Subscribe using the new API that returns an unsubscribe function
    const unsubscribe = window.modbusAPI.subscribeRawLog((log: ModbusRawLog) => {
      // Direct ref check to skip filtering overhead if disabled
      if (!showRawLogRef.current) return

      const ts = new Date(log.timestamp).toLocaleTimeString()
      if (log.tx) addLog('TX', `[${ts}] ${buf2hex(log.tx)}`)
      if (log.rx) addLog('RX', `[${ts}] ${buf2hex(log.rx)}`)
    })

    // Cleanup
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      } else if (window.modbusAPI.unsubscribeRawLog) {
        // Legacy fallback
        window.modbusAPI.unsubscribeRawLog(() => {})
      }
    }
  }, [addLog])

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight
    }
  }, [logs, showLogs])

  const handleCommand = (silent = false) => {
    const fcNum = parseFC(effectiveFc)
    if ([1, 2, 3, 4].includes(fcNum)) handleRead(silent)
    else if (!silent) addLog('SYS', `Command FC:${fcNum} (Auto-read skip)`, undefined)
  }

  // What one auto-read tick does. Kept in a ref and refreshed every render so
  // the interval always runs current logic without listing every field it
  // touches as a dependency — listing them tore the interval down and restarted
  // the 2s timer on each keystroke in the address or count field.
  const autoReadTickRef = useRef<() => void>(() => {})
  useEffect(() => {
    autoReadTickRef.current = () => {
      // Skip this tick rather than stacking a request on top of an in-flight
      // one — overlapping requests on one client time each other out.
      if (busyRef.current) return
      const fcNum = parseFC(effectiveFc)
      if (fcNum >= 1 && fcNum <= 4) handleCommand(false)
    }
  })

  // Auto Read Interval
  useEffect(() => {
    if (!autoRead || !connected) return undefined
    const interval = setInterval(() => autoReadTickRef.current(), 2000)
    return () => clearInterval(interval)
  }, [autoRead, connected])

  // --- GRID CALLBACKS ---
  const handleSelectionStart = useCallback((idx: number) => {
    setIsSelecting(true)
    setSelection({ start: idx, end: idx })
  }, [])

  const handleSelectionEnter = useCallback((idx: number) => {
    if (isSelectingRef.current) {
      setSelection((prev) => (prev ? { ...prev, end: idx } : null))
    }
  }, [])

  const handleCellEdit = useCallback(
    (addr: number, newVal: string) => {
      setMonitorData((prevData) => {
        if (!prevData) return null
        let num = NaN
        const s = newVal.trim()

        if (s.toLowerCase().startsWith('0x')) {
          num = parseInt(s, 16)
        } else if (dataFormat === 'HEX' && /^[0-9A-Fa-f]+$/.test(s)) {
          num = parseInt(s, 16)
        } else {
          num = parseInt(s, 10)
        }

        if (!isNaN(num)) {
          const index = addr - prevData.startAddr
          if (index >= 0 && index < prevData.values.length) {
            const newValues = [...prevData.values]
            newValues[index] = num
            return { ...prevData, values: newValues }
          }
        }
        return prevData
      })
    },
    [dataFormat]
  )

  // Global Mouse Up
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsSelecting(false)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // Keyboard Copy
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (!selection || !monitorData) return
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return

        e.preventDefault()
        const start = Math.min(selection.start, selection.end)
        const end = Math.max(selection.start, selection.end)
        const is32Bit = dataFormat === 'FLOAT' || dataFormat === 'UINT32'

        const rows: string[] = []
        for (let i = start; i <= end; i++) {
          if (is32Bit && i % 2 !== 0) continue
          const val = monitorData.values[i]
          const nextVal = monitorData.values[i + 1]
          rows.push(formatValue(val, nextVal, dataFormat))
        }

        if (rows.length > 0) {
          try {
            await navigator.clipboard.writeText(rows.join('\t'))
            addLog('SYS', `Copied ${rows.length} items`)
          } catch (err) {
            console.error(err)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection, monitorData, dataFormat, addLog])

  // --- Actions ---

  const scanPorts = async () => {
    try {
      const list = await window.modbusAPI.scanSerialPorts()
      setPorts(list)
      if (list.length > 0 && !settings.serialPort) updateInfo('serialPort', list[0].path)
    } catch (e: unknown) {
      addLog('SYS', 'Scan Error', errMsg(e))
    }
  }

  const handleConnect = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSending(true)
    try {
      if (connected) {
        await minDelay(window.modbusAPI.disconnect())
        setConnected(false)
        setAutoRead(false)
        addLog('SYS', 'Disconnected')
      } else {
        if (settings.mode === 'RTU' && !settings.serialPort) return alert('Select Port')
        await minDelay(window.modbusAPI.connect(settings))
        setConnected(true)
        addLog('SYS', `Connected (Timeout: ${settings.timeout}ms)`)
      }
    } catch (e: unknown) {
      setConnected(false)
      addLog('SYS', 'Connection Error', errMsg(e))
    } finally {
      busyRef.current = false
      setSending(false)
    }
  }

  const handleRead = async (silent = false) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const base = addrFormat === 'HEX' ? 16 : 10
      const addrNum = parseInt(address, base)
      let fcNum = parseFC(effectiveFc)
      if (!customFcMode && ![1, 2, 3, 4].includes(fcNum)) fcNum = 3
      const count = parseInt(countParam, 10) || 10
      if (isNaN(addrNum)) throw new Error('Invalid Address')

      if (!silent) setSending(true)
      const execute = async () => {
        const res = await window.modbusAPI.read({
          functionCode: fcNum,
          address: addrNum,
          count
        })
        const numValues = res.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
        setSelection(null)
        setMonitorData({ startAddr: addrNum, values: numValues })
        if (!silent)
          addLog('SYS', `Read ${res.length} items from ${formatAddress(addrNum, addrFormat)}`)
      }
      await (silent ? execute() : minDelay(execute()))
    } catch (e: unknown) {
      addLog('SYS', 'Read Error', errMsg(e))
    } finally {
      busyRef.current = false
      if (!silent) setSending(false)
    }
  }

  const handleWrite = async () => {
    if (busyRef.current || !monitorData) return
    busyRef.current = true
    try {
      const base = addrFormat === 'HEX' ? 16 : 10
      const startAddr = parseInt(address, base)
      const count = parseInt(countParam, 10) || 1
      const fcNum = parseFC(effectiveFc)

      const valuesToWrite: number[] = []
      for (let i = 0; i < count; i++) {
        const idx = startAddr + i - monitorData.startAddr
        if (idx < 0 || idx >= monitorData.values.length)
          throw new Error('Data missing in monitor range')
        valuesToWrite.push(monitorData.values[idx])
      }

      setSending(true)
      const execute = async () => {
        let writeFC = fcNum
        if (!customFcMode && [1, 2, 3, 4].includes(fcNum)) writeFC = count === 1 ? 6 : 16
        await window.modbusAPI.write({
          functionCode: writeFC as number,
          address: startAddr,
          values: count === 1 ? valuesToWrite[0] : valuesToWrite
        })
        addLog('SYS', `Write OK to ${formatAddress(startAddr, addrFormat)}`)

        // Auto Refresh
        if (connected) {
          const readFc = fcNum === 5 || fcNum === 15 ? 1 : 3
          const refreshRes = await window.modbusAPI.read({
            functionCode: readFc,
            address: startAddr,
            count
          })
          const refreshValues = refreshRes.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
          setMonitorData((prev) => {
            if (!prev) return null
            const nextVals = [...prev.values]
            refreshValues.forEach((val, i) => {
              const idx = startAddr - prev.startAddr + i
              if (idx >= 0 && idx < nextVals.length) nextVals[idx] = val
            })
            return { ...prev, values: nextVals }
          })
        }
      }
      await minDelay(execute())
    } catch (e: unknown) {
      addLog('SYS', 'Write Error', errMsg(e))
    } finally {
      busyRef.current = false
      setSending(false)
    }
  }

  const handleMainAction = () => {
    const fcNum = parseFC(effectiveFc)
    const isWrite = !customFcMode ? [6, 16].includes(fcNum) : ![1, 2, 3, 4].includes(fcNum)
    if (isWrite) handleWrite()
    else handleRead(false)
  }

  const toggleAddrFormat = () => {
    const currentBase = addrFormat === 'HEX' ? 16 : 10
    const val = parseInt(address, currentBase)
    const nextFmt = addrFormat === 'HEX' ? 'DEC' : 'HEX'
    setAddrFormat(nextFmt)
    setAddress(!isNaN(val) ? val.toString(nextFmt === 'HEX' ? 16 : 10).toUpperCase() : '0')
  }

  const updateInfo = <K extends keyof ConnectionSettings>(k: K, v: ConnectionSettings[K]): void =>
    setSettings((p) => ({ ...p, [k]: v }))
  const preventEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') e.preventDefault()
  }

  // --- MEMOIZED GRID RENDER ---
  const gridContent = useMemo(() => {
    if (!monitorData) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--c-text-mute)'
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊞</div>
          <div style={{ fontSize: '13px' }}>No Data Available</div>
        </div>
      )
    }

    const is32Bit = dataFormat === 'FLOAT' || dataFormat === 'UINT32'
    const colWidth = is32Bit ? '140px' : '70px'

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${colWidth}, 1fr))`,
          gap: '8px'
        }}
      >
        {monitorData.values.map((val, idx) => {
          if (is32Bit && idx % 2 !== 0) return null
          const currentAddr = monitorData.startAddr + idx

          let isSelected = false
          if (selection) {
            const low = Math.min(selection.start, selection.end)
            const high = Math.max(selection.start, selection.end)
            isSelected = idx >= low && idx <= high
          }

          return (
            <RegisterBlock
              key={currentAddr}
              index={idx}
              address={currentAddr}
              value={val}
              nextValue={monitorData.values[idx + 1]}
              format={dataFormat}
              addrFormat={addrFormat}
              isSelected={isSelected}
              onSelectionStart={handleSelectionStart}
              onSelectionEnter={handleSelectionEnter}
              onEdit={handleCellEdit}
            />
          )
        })}
      </div>
    )
  }, [
    monitorData,
    dataFormat,
    addrFormat,
    selection,
    handleSelectionStart,
    handleSelectionEnter,
    handleCellEdit
  ])

  // --- Render ---
  const inputBase = {
    padding: '0 10px',
    height: '36px',
    borderRadius: '6px',
    border: '1px solid var(--c-border)',
    fontSize: '13px',
    color: 'var(--c-text)',
    background: 'var(--c-bg)',
    transition: 'border 0.2s',
    boxSizing: 'border-box' as const
  }
  const labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--c-text)',
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
  // Reverted Clear Button Style
  const clearBtnStyle = {
    background: 'transparent',
    border: 'none',
    fontSize: '11px',
    cursor: 'pointer',
    color: 'var(--c-text-sub)'
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        padding: '20px',
        boxSizing: 'border-box',
        background: 'var(--c-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      {/* 0. App header — identity on the left, app-level chrome on the right.
          Theme belongs here rather than in the connection form: it is not a
          Modbus setting. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--c-border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BrandMark size={18} />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: 'var(--c-text)'
            }}
          >
            ModbusX
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      {/* 1. Settings */}
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
          onClick={handleConnect}
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

      {/* 2. Commands */}
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
                onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
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
              onKeyDown={(e) => e.key === 'Enter' && handleMainAction()}
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
            onKeyDown={(e) => e.key === 'Enter' && handleMainAction()}
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
            onClick={handleMainAction}
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

      {/* 3. Data Monitor */}
      <div
        style={{
          flex: showLogs ? 2 : 1,
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{gridContent}</div>
      </div>

      {/* 4. Logs */}
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
              <button onClick={() => setLogs([])} style={clearBtnStyle}>
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
          ref={logListRef}
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
    </div>
  )
}

export default ModbusDebugger
