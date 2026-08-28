// modbus-ipc.ts
import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
import { ModbusClient } from './modbus-client'
import { ModbusLogger } from './modbus-logger'
import { ConnectionSettings, ModbusReadParams, ModbusWriteParams } from './modbus'

const logger = new ModbusLogger()
const client = new ModbusClient(logger)

ipcMain.handle('modbus-connect', async (event, options: ConnectionSettings) => {
  await client.connect(options)
  return true
})

ipcMain.handle('modbus-disconnect', async (event) => {
  // Must be awaited: resolving before the port is closed lets an immediate
  // reconnect race the teardown, which wedges a serial port with
  // "Access denied" for the remaining lifetime of the process.
  await client.disconnect()
  return true
})

ipcMain.handle('modbus-read', async (event, params: ModbusReadParams) => {
  return await client.read(params)
})

ipcMain.handle('modbus-write', async (event, params: ModbusWriteParams) => {
  return await client.write(params)
})

ipcMain.handle('modbus-list-ports', async () => {
  const ports = await SerialPort.list()
  return ports.map((port) => ({ path: port.path, manufacturer: port.manufacturer }))
})

/** Release the port/socket on shutdown. Safe to call when not connected. */
export async function closeModbus(): Promise<void> {
  await client.disconnect()
}
