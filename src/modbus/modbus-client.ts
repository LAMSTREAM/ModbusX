// modbus-client.ts
import ModbusRTU from 'modbus-serial'
import { ModbusLogger } from './modbus-logger'
import { ConnectionSettings, ModbusReadParams, ModbusWriteParams, ModbusReadResult } from './modbus'

export class ModbusClient {
  private client: ModbusRTU | null = null
  private logger: ModbusLogger

  constructor(logger: ModbusLogger) {
    this.logger = logger
  }

  async connect(options: ConnectionSettings): Promise<void> {
    if (this.client) {
      try {
        const oldClient = this.client
        this.client = null // 先置空，防止并发
        if (oldClient.isOpen) {
          await new Promise<void>((resolve) => oldClient.close(() => resolve()))
        }
      } catch (e) {
        console.warn('Error closing old client:', e)
      }
    }

    const newClient = new ModbusRTU()
    newClient.setTimeout(options.timeout || 1000)

    try {
      if (options.mode === 'TCP') {
        if (!options.ipAddress) throw new Error('TCP mode requires ipAddress')
        await newClient.connectTCP(options.ipAddress, { port: options.port || 502 })
      } else {
        if (!options.serialPort) throw new Error('RTU mode requires serialPort')
        await newClient.connectRTU(options.serialPort, {
          baudRate: options.baudRate || 9600,
          dataBits: options.dataBits || 8,
          parity: options.parity || 'none',
          stopBits: options.stopBits || 1
        })
      }

      newClient.setID(options.slaveId || 1)
      this.client = newClient
    } catch (err: any) {
      newClient.close(() => {})
      this.client = null
      throw new Error(`Connection failed: ${err?.message ?? String(err)}`)
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      const c = this.client
      this.client = null
      if (c.isOpen) {
        return new Promise((resolve) => c.close(() => resolve()))
      }
    }
  }

  async read(params: ModbusReadParams): Promise<ModbusReadResult> {
    if (!this.client || !this.client.isOpen) throw new Error('Modbus client is not connected.')

    let result: ModbusReadResult = []

    try {
      switch (params.functionCode) {
        case 0x01:
          result = (await this.client.readCoils(params.address, params.count)).data
          break
        case 0x02:
          result = (await this.client.readDiscreteInputs(params.address, params.count)).data
          break
        case 0x03:
          result = (await this.client.readHoldingRegisters(params.address, params.count)).data
          break
        case 0x04:
          result = (await this.client.readInputRegisters(params.address, params.count)).data
          break
        default:
          throw new Error(`Unsupported read function code: ${params.functionCode}`)
      }
      return result
    } finally {
      this.tryLogTraffic()
    }
  }

  async write(params: ModbusWriteParams): Promise<void> {
    if (!this.client || !this.client.isOpen) throw new Error('Modbus client is not connected.')

    try {
      switch (params.functionCode) {
        case 0x05:
          await this.client.writeCoil(params.address, params.values as boolean)
          break
        case 0x06:
          await this.client.writeRegister(params.address, params.values as number)
          break
        case 0x0f:
          await this.client.writeCoils(params.address, params.values as boolean[])
          break
        case 0x10:
          await this.client.writeRegisters(params.address, params.values as number[])
          break
        default:
          throw new Error(`Unsupported write function code: ${params.functionCode}`)
      }
    } finally {
      this.tryLogTraffic()
    }
  }

  private tryLogTraffic() {
    try {
      if (!this.client) return
      const clientAny = this.client as any
      const port = clientAny._port || clientAny._client || clientAny._netSocket

      if (port) {
        const tx = port.lastRequestBuffer ?? port.lastRequest
        const rx = port.lastResponseBuffer ?? port.lastResponse

        if ((tx && tx.length > 0) || (rx && rx.length > 0)) {
          this.logger.pushTxRx(tx, rx)
        }
      }
    } catch (e) {
      console.warn('Log capture failed', e)
    }
  }
}
