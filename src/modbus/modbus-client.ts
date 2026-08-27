import ModbusRTU from 'modbus-serial'
import { ModbusLogger } from './modbus-logger'
import { ConnectionSettings, ModbusReadParams, ModbusWriteParams, ModbusReadResult } from './modbus'
import { ByteStream, defaultIdleGap, rawTransaction, RawTransactionResult } from './modbus-raw'

const STANDARD_READ_CODES = [0x01, 0x02, 0x03, 0x04]
const STANDARD_WRITE_CODES = [0x05, 0x06, 0x0f, 0x10]
const CLOSE_GRACE_MS = 2000
const DEFAULT_TIMEOUT_MS = 1000

/**
 * Serialises async work. `modbus-serial` keeps a single in-flight transaction
 * per client, so overlapping requests cross-talk: measured against real
 * hardware, 2 of 3 concurrent reads fail with "Timed out" even though the same
 * read succeeds on its own. Every public method funnels through here.
 */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn)
    // Keep the chain alive regardless of individual outcomes.
    this.tail = result.catch(() => undefined)
    return result
  }
}

export class ModbusClient {
  private client: ModbusRTU | null = null
  private logger: ModbusLogger
  private mutex = new Mutex()
  private mode: ConnectionSettings['mode'] = 'RTU'
  private slaveId = 1
  private timeout = DEFAULT_TIMEOUT_MS
  private idleGapMs = defaultIdleGap()

  constructor(logger: ModbusLogger) {
    this.logger = logger
  }

  async connect(options: ConnectionSettings): Promise<void> {
    return this.mutex.run(async () => {
      // Close any previous client unconditionally and *wait* for it. Gating this
      // on `isOpen` leaks the handle when the port is still opening, and not
      // awaiting it means the OS still holds the port when we reopen — which
      // wedges the port with "Access denied" for the rest of the process.
      const oldClient = this.client
      this.client = null
      if (oldClient) await this.closeQuietly(oldClient)

      const newClient = new ModbusRTU()
      this.timeout = normaliseTimeout(options.timeout)
      newClient.setTimeout(this.timeout)

      try {
        if (options.mode === 'TCP') {
          if (!options.ipAddress) throw new Error('TCP mode requires ipAddress')
          // `setTimeout` only bounds requests, not the TCP handshake, so an
          // unreachable host would otherwise hang for the OS SYN timeout.
          await withTimeout(
            newClient.connectTCP(options.ipAddress, { port: options.port || 502 }),
            this.timeout,
            `Timed out connecting to ${options.ipAddress}:${options.port || 502}`
          )
          this.idleGapMs = defaultIdleGap()
        } else {
          if (!options.serialPort) throw new Error('RTU mode requires serialPort')
          const baudRate = options.baudRate || 9600
          await newClient.connectRTUBuffered(options.serialPort, {
            baudRate,
            dataBits: options.dataBits || 8,
            parity: options.parity || 'none',
            stopBits: options.stopBits || 1
          })
          this.idleGapMs = defaultIdleGap(baudRate)
        }

        this.slaveId = options.slaveId || 1
        this.mode = options.mode
        newClient.setID(this.slaveId)
        this.client = newClient

        this.setupTrafficMonitor(newClient)
      } catch (err: unknown) {
        await this.closeQuietly(newClient)
        this.client = null
        throw new Error(`Connection failed: ${errorMessage(err)}`)
      }
    })
  }

  async disconnect(): Promise<void> {
    return this.mutex.run(async () => {
      const c = this.client
      this.client = null
      if (c) await this.closeQuietly(c)
    })
  }

  async read(params: ModbusReadParams): Promise<ModbusReadResult> {
    return this.mutex.run(async () => {
      const client = this.requireClient()

      if (!STANDARD_READ_CODES.includes(params.functionCode)) {
        // Custom-FC read: same framing problem as a custom write, so it goes
        // through the raw layer. Registers are returned as unsigned 16-bit.
        const body = Buffer.alloc(4)
        body.writeUInt16BE(assertAddress(params.address), 0)
        body.writeUInt16BE(params.count & 0xffff, 2)
        const { pdu } = await this.rawRequest(client, params.functionCode, body)
        return decodeRegisterPdu(pdu)
      }

      switch (params.functionCode) {
        case 0x01:
          return (await client.readCoils(params.address, params.count)).data
        case 0x02:
          return (await client.readDiscreteInputs(params.address, params.count)).data
        case 0x03:
          return (await client.readHoldingRegisters(params.address, params.count)).data
        default:
          return (await client.readInputRegisters(params.address, params.count)).data
      }
    })
  }

  async write(params: ModbusWriteParams): Promise<void> {
    return this.mutex.run(async () => {
      const client = this.requireClient()

      if (!STANDARD_WRITE_CODES.includes(params.functionCode)) {
        const body = this.createCustomWritePayload(params.address, params.values as number[])
        await this.rawRequest(client, params.functionCode, body)
        return
      }

      switch (params.functionCode) {
        case 0x05:
          await client.writeCoil(params.address, params.values as boolean)
          break
        case 0x06:
          await client.writeRegister(params.address, params.values as number)
          break
        case 0x0f:
          await client.writeCoils(params.address, params.values as boolean[])
          break
        default:
          await client.writeRegisters(params.address, params.values as number[])
          break
      }
    })
  }

  /**
   * Custom function codes bypass `modbus-serial` entirely.
   *
   * `writeCustomFC` cannot work over a buffered RTU port: the port sets its
   * expected reply length to 0 for any unrecognised code and then discards
   * every received byte, so both positive and exception replies are lost and
   * the call can only time out. We frame the request ourselves on the stream
   * the library already owns.
   */
  private async rawRequest(
    client: ModbusRTU,
    functionCode: number,
    body: Uint8Array
  ): Promise<RawTransactionResult> {
    const stream = this.getStream(client)
    if (!stream) {
      throw new Error(
        `Cannot send custom function code 0x${functionCode.toString(16).toUpperCase()}: ` +
          'underlying stream is unavailable (modbus-serial internals may have changed)'
      )
    }

    try {
      return await rawTransaction(stream, this.mode, {
        slaveId: this.slaveId,
        functionCode,
        body,
        timeout: this.timeout,
        idleGapMs: this.idleGapMs
      })
    } finally {
      // Our reply also landed in the library's own receive buffer. Clear it so
      // the next standard request is not parsed against our leftovers.
      this.resetPortBuffer(client)
    }
  }

  /**
   * Body layout for a custom register write, verified against hardware:
   * big-endian `[address:u16][registerCount:u16][byteCount:u8][data:u16...]`.
   * Layouts omitting `byteCount` make the device wait for bytes that never
   * arrive, so the field is required.
   */
  private createCustomWritePayload(address: number, data: number[]): Uint8Array {
    assertAddress(address)

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Custom write requires at least one register value')
    }

    const registerCount = data.length
    const dataBytesLength = registerCount * 2

    if (dataBytesLength > 255) {
      throw new Error(
        `Data length (${dataBytesLength} bytes) exceeds the maximum capacity (255) for a single-byte Byte Count field.`
      )
    }

    const buffer = Buffer.alloc(5 + dataBytesLength)
    buffer.writeUInt16BE(address, 0)
    buffer.writeUInt16BE(registerCount, 2)
    buffer.writeUInt8(dataBytesLength, 4)

    data.forEach((value, index) => {
      // Accept both unsigned (0..65535) and signed (-32768..-1) input; the
      // previous `setInt16` threw a RangeError for anything above 0x7FFF,
      // which made ordinary unsigned register values unwritable.
      if (!Number.isInteger(value) || value < -32768 || value > 65535) {
        throw new Error(
          `Invalid register value at index ${index}: ${value} (expected an integer in -32768..65535)`
        )
      }
      buffer.writeUInt16BE(value < 0 ? value + 0x10000 : value, 5 + index * 2)
    })

    return buffer
  }

  private requireClient(): ModbusRTU {
    if (!this.client || !this.client.isOpen) throw new Error('Modbus client is not connected.')
    return this.client
  }

  /** Resolves once the client is closed; never rejects and never hangs. */
  private closeQuietly(client: ModbusRTU): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(guard)
        resolve()
      }
      const guard = setTimeout(finish, CLOSE_GRACE_MS)
      try {
        client.close(() => finish())
      } catch (e) {
        console.warn('Error closing client:', e)
        finish()
      }
    })
  }

  private getStream(client: ModbusRTU): ByteStream | null {
    const clientAny = client as unknown as {
      _port?: { _client?: ByteStream }
      _netSocket?: ByteStream
    }
    return clientAny._port?._client ?? clientAny._netSocket ?? null
  }

  private resetPortBuffer(client: ModbusRTU): void {
    const port = (client as unknown as { _port?: { _buffer?: Buffer } })._port
    if (port && Buffer.isBuffer(port._buffer)) port._buffer = Buffer.alloc(0)
  }

  private setupTrafficMonitor(client: ModbusRTU): void {
    try {
      const stream = this.getStream(client) as
        | (ByteStream & { write: (chunk: Buffer, ...args: unknown[]) => boolean })
        | null

      if (stream) {
        // RX
        stream.on('data', (chunk: Buffer) => {
          this.logger.pushTxRx(undefined, chunk)
        })

        // TX (Monkey Patch write)
        const originalWrite = stream.write
        stream.write = (chunk: Buffer, ...args: unknown[]) => {
          this.logger.pushTxRx(chunk, undefined)
          return originalWrite.call(stream, chunk, ...args)
        }
      }
    } catch (e) {
      console.warn('Traffic monitor setup failed:', e)
    }
  }
}

function assertAddress(address: number): number {
  if (address < 0 || address > 65535 || !Number.isInteger(address)) {
    throw new Error('Invalid Address')
  }
  return address
}

function normaliseTimeout(timeout?: number): number {
  return Number.isFinite(timeout) && (timeout as number) > 0
    ? (timeout as number)
    : DEFAULT_TIMEOUT_MS
}

function errorMessage(err: unknown): string {
  return (err as Error)?.message ?? String(err)
}

/** Decodes a `[fc][byteCount][data...]` reply into unsigned 16-bit registers. */
function decodeRegisterPdu(pdu: Uint8Array): number[] {
  const buf = Buffer.from(pdu)
  if (buf.length < 2) return []
  const byteCount = buf.readUInt8(1)
  const payload = buf.subarray(2, 2 + Math.min(byteCount, buf.length - 2))
  const values: number[] = []
  for (let i = 0; i + 1 < payload.length; i += 2) values.push(payload.readUInt16BE(i))
  return values
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}
