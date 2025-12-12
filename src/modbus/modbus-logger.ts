// modbus-logger.ts
import { BrowserWindow } from 'electron'
import { ModbusRawLog } from './modbus'

export class ModbusLogger {
  private subscribers: ((log: ModbusRawLog) => void)[] = []

  pushTxRx(tx?: Uint8Array | Buffer, rx?: Uint8Array | Buffer): void {
    const log: ModbusRawLog = {
      timestamp: Date.now(),
      tx: tx ? new Uint8Array(tx) : undefined,
      rx: rx ? new Uint8Array(rx) : undefined
    }

    // Push to Subscriber
    this.subscribers.forEach((cb) => cb(log))

    // Push to Frontend
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('modbus-raw-log', log)
    })
  }

  subscribe(cb: (log: ModbusRawLog) => void): void {
    this.subscribers.push(cb)
  }

  unsubscribe(cb: (log: ModbusRawLog) => void): void {
    this.subscribers = this.subscribers.filter((c) => c !== cb)
  }
}
