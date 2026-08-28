import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ConnectionSettings, ModbusRawLog } from '../../../modbus/modbus'
import TitleBar from './TitleBar'
import RegisterBlock from './RegisterBlock'
import SettingsBar from './SettingsBar'
import CommandBar from './CommandBar'
import DataMonitor from './DataMonitor'
import LogPane from './LogPane'
import { useTheme } from '../hooks/useTheme'
import {
  COIL_CODES,
  MAX_LOG_ENTRIES,
  STORAGE_KEY,
  WRITE_CODES,
  loadConfig,
  type AddressFormat,
  type DataFormat,
  type LogItem,
  type SavedConfig
} from '../lib/modbus-config'
import {
  buf2hex,
  errMsg,
  formatAddress,
  formatValue,
  minDelay,
  parseFC,
  parseValue,
  toWireAddress
} from '../lib/modbus-format'

// Two COMPLETE literal strings, never a template. Tailwind v4 scans source
// text and will not emit a class it cannot see spelled out, so building
// `minmax(${colWidth},1fr)` from a variable would silently produce no rule at
// all. This is the mechanism AC7 rests on.
// Two complete literal class strings, never assembled from a variable:
// Tailwind scans source text and will not emit a class it cannot see spelled
// out. The wide track exists for the formats whose text does not fit 70px —
// the 32-bit pair, and BIN, whose sixteen digits need roughly 125px.
const GRID_NARROW = 'grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(70px,1fr))]'
const GRID_WIDE = 'grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]'

/** Formats that need the wide track, and those that pair two registers. */
const WIDE_FORMATS: DataFormat[] = ['BIN', 'UINT32', 'FLOAT']
const PAIRED_FORMATS: DataFormat[] = ['UINT32', 'FLOAT']

// `window.modbusAPI` is declared once, globally, in modbus.d.ts as `IModbusAPI`.
// Re-declaring a structurally different shape here made the two augmentations
// disagree (TS2717) and collapsed `subscribeRawLog` to `never` at its call site.

// --- Main Component ---
const ModbusDebugger: React.FC = () => {
  const initialConfig = loadConfig()
  const { theme, toggleTheme } = useTheme()

  // State
  const [settings, setSettings] = useState<ConnectionSettings>(initialConfig.settings)
  const [ports, setPorts] = useState<{ path: string }[]>([])
  // Distinguishes "not scanned yet" from "scanned and found nothing", so the
  // dropdown can say which.
  const [portsScanned, setPortsScanned] = useState(false)
  const [connected, setConnected] = useState(false)
  // Distinguishes "never connected" from "dropped with an error" for the
  // status indicator; the button label alone cannot tell them apart.
  const [connError, setConnError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [standardFc, setStandardFc] = useState<string>(initialConfig.standardFc || '3')
  const [customFcValue, setCustomFcValue] = useState<string>(initialConfig.customFcValue || '')
  const [customFcMode, setCustomFcMode] = useState(initialConfig.customFcMode)
  const [address, setAddress] = useState<string>(initialConfig.address)
  const [addrFormat, setAddrFormat] = useState<AddressFormat>(initialConfig.addrFormat)
  const [addrBase, setAddrBase] = useState<number>(initialConfig.addrBase ?? 0)
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
      addrBase,
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
    addrBase,
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
        // Reverse translation is delegated to parseValue, the exact inverse of
        // formatValue: one word for the 16-bit formats, two for UINT32/FLOAT,
        // or null when the text cannot be represented. Rejecting is
        // deliberate — the previous branch fell through to parseInt(s, 10) and
        // would happily write a garbage register for, say, "1.5" under FLOAT.
        const words = parseValue(newVal, dataFormat)
        if (!words) return prevData

        const index = addr - prevData.startAddr
        if (index < 0 || index + words.length > prevData.values.length) return prevData

        const newValues = [...prevData.values]
        words.forEach((w, i) => {
          newValues[index + i] = w
        })
        return { ...prevData, values: newValues }
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

  const scanPorts = useCallback(async () => {
    try {
      const list = await window.modbusAPI.scanSerialPorts()
      setPorts(list)
      setPortsScanned(true)
      if (list.length > 0 && !settings.serialPort) updateInfo('serialPort', list[0].path)
    } catch (e: unknown) {
      setPortsScanned(true)
      addLog('SYS', 'Scan Error', errMsg(e))
    }
    // Depends on `settings.serialPort` alone, not the whole settings object:
    // the port is read only to decide whether to seed a default, and widening
    // the dependency would re-create this on every keystroke in the form.
  }, [settings.serialPort, addLog])

  // Scan whenever RTU becomes the active mode — on launch if the saved config
  // is RTU, and on every switch back to it. Without this the port dropdown is
  // empty until the user thinks to press the scan button.
  useEffect(() => {
    if (settings.mode === 'RTU') void scanPorts()
  }, [settings.mode, scanPorts])

  const handleConnect = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSending(true)
    try {
      if (connected) {
        await minDelay(window.modbusAPI.disconnect())
        setConnected(false)
        setConnError(null)
        setAutoRead(false)
        addLog('SYS', 'Disconnected')
      } else {
        if (settings.mode === 'RTU' && !settings.serialPort) return alert('Select Port')
        await minDelay(window.modbusAPI.connect(settings))
        setConnected(true)
        setConnError(null)
        addLog('SYS', `Connected (Timeout: ${settings.timeout}ms)`)
      }
    } catch (e: unknown) {
      setConnected(false)
      setConnError(errMsg(e))
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
      // The field holds a DISPLAY address; the wire wants it without the base.
      const addrNum = toWireAddress(address, addrFormat, addrBase)
      let fcNum = parseFC(effectiveFc)
      if (!customFcMode && ![1, 2, 3, 4].includes(fcNum)) fcNum = 3
      const count = parseInt(countParam, 10) || 10
      if (isNaN(addrNum)) throw new Error('Invalid Address')
      if (addrNum < 0)
        throw new Error(`Address is below the base offset (${addrBase}) — nothing to read`)

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
          addLog(
            'SYS',
            `Read ${res.length} items from ${formatAddress(addrNum, addrFormat, addrBase)}`
          )
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
      const startAddr = toWireAddress(address, addrFormat, addrBase)
      const count = parseInt(countParam, 10) || 1
      if (isNaN(startAddr)) throw new Error('Invalid Address')
      if (startAddr < 0)
        throw new Error(`Address is below the base offset (${addrBase}) — nothing to write`)
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
        // Honour the SELECTED write code. This used to re-derive it from the
        // count (`count === 1 ? 6 : 16`), which silently ignored the user's
        // choice and left 0x05 and 0x0F unreachable from the dropdown. Only a
        // read code still falls back, since "write" was inferred in that case.
        let writeFC = fcNum
        if (!customFcMode && !WRITE_CODES.includes(fcNum)) writeFC = count === 1 ? 6 : 16

        // Coil codes exchange booleans; register codes exchange 16-bit words.
        const isCoil = COIL_CODES.includes(writeFC)
        const payload: number[] | boolean[] = isCoil
          ? valuesToWrite.map((v) => v !== 0)
          : valuesToWrite

        // 0x05 and 0x06 carry a single value; 0x0F and 0x10 carry arrays.
        const single = writeFC === 5 || writeFC === 6

        await window.modbusAPI.write({
          functionCode: writeFC as number,
          address: startAddr,
          values: single ? payload[0] : payload
        })
        addLog('SYS', `Write OK to ${formatAddress(startAddr, addrFormat, addrBase)}`)

        // Auto Refresh
        if (connected) {
          // Read back with the matching read code so the refresh looks at the
          // same address space that was just written.
          const readFc = COIL_CODES.includes(writeFC) ? 1 : 3
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
    const isWrite = !customFcMode ? WRITE_CODES.includes(fcNum) : ![1, 2, 3, 4].includes(fcNum)
    if (isWrite) handleWrite()
    else handleRead(false)
  }

  const toggleAddrFormat = () => {
    // Converts the radix of the DISPLAY value only. The base offset is a plain
    // decimal number and does not move with it.
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
        <div className="flex h-full flex-col items-center justify-center text-faint">
          <div className="mb-3 text-[32px] opacity-30">⊞</div>
          <div className="text-[13px]">No Data Available</div>
        </div>
      )
    }

    const isPaired = PAIRED_FORMATS.includes(dataFormat)

    return (
      <div className={WIDE_FORMATS.includes(dataFormat) ? GRID_WIDE : GRID_NARROW}>
        {monitorData.values.map((val, idx) => {
          if (isPaired && idx % 2 !== 0) return null
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
              addrBase={addrBase}
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
    addrBase,
    selection,
    handleSelectionStart,
    handleSelectionEnter,
    handleCellEdit
  ])
  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* 0. Title bar — the window is frameless, so this is the app's own
          chrome: drag region, identity, theme toggle and window controls. */}
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />

      {/* Everything below the title bar keeps the page padding. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        {/* 1. Settings */}
        <SettingsBar
          settings={settings}
          updateInfo={updateInfo}
          ports={ports}
          portsScanned={portsScanned}
          scanPorts={scanPorts}
          connected={connected}
          sending={sending}
          connError={connError}
          onConnect={handleConnect}
          preventEnter={preventEnter}
        />

        {/* 2. Commands */}
        <CommandBar
          customFcMode={customFcMode}
          setCustomFcMode={setCustomFcMode}
          standardFc={standardFc}
          setStandardFc={setStandardFc}
          customFcValue={customFcValue}
          setCustomFcValue={setCustomFcValue}
          address={address}
          setAddress={setAddress}
          countParam={countParam}
          setCountParam={setCountParam}
          autoRead={autoRead}
          setAutoRead={setAutoRead}
          addrFormat={addrFormat}
          toggleAddrFormat={toggleAddrFormat}
          addrBase={addrBase}
          setAddrBase={setAddrBase}
          effectiveFc={effectiveFc}
          connected={connected}
          sending={sending}
          onCommand={handleCommand}
          onMainAction={handleMainAction}
        />

        {/* 3. Data Monitor — `gridContent` is passed as a child rather than built
            inside DataMonitor, for two reasons. Building it there would re-derive
            the whole grid whenever the format-toggle row re-renders; and a
            memoized ELEMENT passed as a child keeps its referential identity, so
            React bails out of reconciling the entire grid subtree when this
            parent re-renders for an unrelated reason. Do not "tidy" this inward. */}
        <DataMonitor dataFormat={dataFormat} setDataFormat={setDataFormat} expanded={showLogs}>
          {gridContent}
        </DataMonitor>

        {/* 4. Logs */}
        <LogPane
          logs={logs}
          showLogs={showLogs}
          setShowLogs={setShowLogs}
          showRawLog={showRawLog}
          setShowRawLog={setShowRawLog}
          onClear={() => setLogs([])}
          listRef={logListRef}
        />
      </div>
    </div>
  )
}

export default ModbusDebugger
