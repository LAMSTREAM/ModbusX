export type ModbusMode = 'RTU' | 'TCP'

export interface ConnectionSettings {
  mode: ModbusMode
  slaveId: number
  timeout?: number

  // TCP Specific
  ipAddress?: string
  port?: number

  // RTU Specific
  serialPort?: string
  baudRate?: 9600 | 19200 | 38400 | 57600 | 115200 | number
  dataBits?: 8 | 7
  parity?: 'none' | 'even' | 'odd'
  stopBits?: 1 | 2
}

export interface ModbusReadParams {
  functionCode: 0x01 | 0x02 | 0x03 | 0x04
  address: number
  count: number
}

export type ModbusReadResult = number[] | boolean[]

export interface ModbusWriteParams {
  functionCode: 0x05 | 0x06 | 0x0f | 0x10 | number
  address: number
  values: number | boolean | number[] | boolean[]
}

export interface ModbusRawLog {
  timestamp: number
  tx?: Uint8Array
  rx?: Uint8Array
}

export interface IModbusAPI {
  connect: (options: ConnectionSettings) => Promise<void>
  disconnect: () => Promise<void>

  read: (params: ModbusReadParams) => Promise<number[] | boolean[]>
  write: (params: ModbusWriteParams) => Promise<void>
  scanSerialPorts: () => Promise<{ path: string; manufacturer?: string }[]>

  subscribeRawLog: (callback: (log: ModbusRawLog) => void) => void
  subscribeRawLog: (callback: (log: ModbusRawLog) => void) => () => void
  unsubscribeRawLog: (unsubscribe: () => void) => void
}

declare global {
  interface Window {
    modbusAPI: IModbusAPI
  }
}
