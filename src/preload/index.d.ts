import { ElectronAPI } from '@electron-toolkit/preload'
import { IModbusAPI } from '../modbus/modbus'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    modbusAPI: IModbusAPI
  }
}
