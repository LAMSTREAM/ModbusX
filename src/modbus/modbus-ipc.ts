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
  client.disconnect()
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
