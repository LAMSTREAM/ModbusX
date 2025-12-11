// modbus-handler.ts
import { ipcRenderer } from 'electron'
import {
  IModbusAPI,
  ModbusReadParams,
  ModbusWriteParams,
  ModbusRawLog,
  ConnectionSettings
} from './modbus'

export const modbusHandler: IModbusAPI = {
  connect: (options: ConnectionSettings) => ipcRenderer.invoke('modbus-connect', options),
  disconnect: () => ipcRenderer.invoke('modbus-disconnect'),

  read: (params: ModbusReadParams) => ipcRenderer.invoke('modbus-read', params),
  write: (params: ModbusWriteParams) => ipcRenderer.invoke('modbus-write', params),
  scanSerialPorts: () => ipcRenderer.invoke('modbus-list-ports'),

  subscribeRawLog: (callback) => {
    const handler = (_: any, data: ModbusRawLog) => callback(data)
    ipcRenderer.on('modbus-raw-log', handler)
    const unsubscribe = () => ipcRenderer.removeListener('modbus-raw-log', handler)
    return unsubscribe
  },

  unsubscribeRawLog: (unsubscribe) => {
    if (typeof unsubscribe === 'function') {
      ;(unsubscribe as any)()
    }
  }
}
