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

export type DataFormat = 'HEX' | 'DEC_U' | 'DEC_S' | 'UINT32' | 'ASCII' | 'FLOAT'
export type AddressFormat = 'HEX' | 'DEC'

export interface SavedConfig {
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

export const loadConfig = (): SavedConfig => {
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
