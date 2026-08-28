import { ConnectionSettings } from '../../../modbus/modbus'

// --- Constants ---
export const STORAGE_KEY = 'modbus_debugger_config'
export const MAX_LOG_ENTRIES = 100

export const BAUD_RATES = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 56000, 57600, 115200, 128000, 256000
]

export const DEFAULT_SETTINGS: ConnectionSettings = {
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
export interface LogItem {
  id: number
  time: string
  dir: 'TX' | 'RX' | 'SYS'
  msg: string
  detail?: string
}

export type DataFormat = 'BIN' | 'HEX' | 'UINT16' | 'SINT16' | 'UINT32' | 'FLOAT' | 'ASCII'
export type AddressFormat = 'HEX' | 'DEC'

export interface SavedConfig {
  settings: ConnectionSettings
  standardFc: string
  customFcValue: string
  address: string
  addrFormat: AddressFormat
  /**
   * Display offset. The Address field and every grid label show
   * `wireAddress + addrBase`; what goes on the wire is `typed - addrBase`.
   * 0 means the field IS the protocol address. Always decimal, whatever radix
   * the address field is in, because it is an offset rather than an address.
   */
  addrBase: number
  countParam: string
  dataFormat: DataFormat
  customFcMode: boolean
  showLogs: boolean
  showRawLog: boolean
}

// --- Helpers ---

/** Formats renamed after the first release, mapped to their current names. */
const LEGACY_FORMATS: Record<string, DataFormat> = {
  DEC_U: 'UINT16',
  DEC_S: 'SINT16'
}

export const loadConfig = (): SavedConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        // `addrBase` post-dates the first schema, so a config written before it
        // existed has no key at all. Default it rather than letting `undefined`
        // reach the arithmetic.
        addrBase: 0,
        ...parsed,
        // DEC_U/DEC_S were renamed to UINT16/SINT16. A config saved under the
        // old names would otherwise select nothing and render every cell blank.
        dataFormat: LEGACY_FORMATS[parsed.dataFormat] ?? parsed.dataFormat,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings }
      }
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
    addrBase: 0,
    countParam: '10',
    dataFormat: 'UINT16',
    customFcMode: false,
    showLogs: true,
    showRawLog: false
  }
}

/**
 * The eight standard function codes, ascending.
 *
 * `value` stays DECIMAL because that is what `standardFc` has always held and
 * what existing saved configs contain; only the label is hex. All eight are
 * already implemented in `src/modbus/modbus-client.ts` — this list is what
 * exposes them.
 */
export interface FunctionCode {
  /** Decimal, as stored. */
  value: string
  /** `0x01`-style label. */
  label: string
  name: string
  kind: 'read' | 'write'
  /** Coil-oriented codes exchange booleans rather than 16-bit words. */
  coil: boolean
}

export const FUNCTION_CODES: FunctionCode[] = [
  { value: '1', label: '0x01', name: 'Read Coils', kind: 'read', coil: true },
  { value: '2', label: '0x02', name: 'Read Discrete Inputs', kind: 'read', coil: true },
  { value: '3', label: '0x03', name: 'Read Holding Registers', kind: 'read', coil: false },
  { value: '4', label: '0x04', name: 'Read Input Registers', kind: 'read', coil: false },
  { value: '5', label: '0x05', name: 'Write Single Coil', kind: 'write', coil: true },
  { value: '6', label: '0x06', name: 'Write Single Register', kind: 'write', coil: false },
  { value: '15', label: '0x0F', name: 'Write Multiple Coils', kind: 'write', coil: true },
  { value: '16', label: '0x10', name: 'Write Multiple Registers', kind: 'write', coil: false }
]

export const WRITE_CODES = [5, 6, 15, 16]
export const COIL_CODES = [1, 2, 5, 15]
