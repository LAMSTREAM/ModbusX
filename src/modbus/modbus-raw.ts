// modbus-raw.ts
//
// Raw Modbus transaction layer for custom function codes.
//
// `modbus-serial` cannot receive a custom-FC reply over a buffered RTU port:
// ports/rtubufferedport.js `write()` falls through to its `default:` branch for
// any unrecognised code and sets `_length = 0`, after which `onData` discards
// every byte because `0 < MIN_DATA_LENGTH`. Positive replies *and* exception
// replies are dropped, so the request can only ever time out.
//
// We therefore build and parse custom-FC frames ourselves, writing straight to
// the stream `modbus-serial` already owns. Standard function codes still go
// through the library.

import crc16 from 'modbus-serial/utils/crc16'
import { ModbusMode } from './modbus'

/** Minimum RTU reply: slave + fc + exception code + CRC16. */
const RTU_EXCEPTION_LENGTH = 5
const MBAP_LENGTH = 6

export interface RawTransactionOptions {
  slaveId: number
  functionCode: number
  /** PDU body — everything after the function code. */
  body: Uint8Array
  timeout: number
  /**
   * Silence that marks the end of a reply, in ms. Modbus specifies a 3.5-char
   * gap, which is ~2ms at 19200 baud — far below USB-serial scheduling jitter
   * (an FTDI latency timer defaults to 16ms). We take the larger of the
   * computed gap and a floor, and short-circuit as soon as the buffer forms a
   * CRC-valid frame, so a well-formed reply still returns promptly.
   */
  idleGapMs?: number
}

export interface RawTransactionResult {
  /** The complete reply, CRC/MBAP stripped: [fc, ...body]. */
  pdu: Uint8Array
  /** The reply exactly as it arrived on the wire. */
  raw: Uint8Array
}

export class ModbusExceptionError extends Error {
  readonly modbusCode: number
  constructor(functionCode: number, code: number) {
    super(
      `Modbus exception ${code} (${exceptionText(code)}) for function code 0x${functionCode
        .toString(16)
        .toUpperCase()}`
    )
    this.name = 'ModbusExceptionError'
    this.modbusCode = code
  }
}

function exceptionText(code: number): string {
  switch (code) {
    case 0x01:
      return 'Illegal function'
    case 0x02:
      return 'Illegal data address'
    case 0x03:
      return 'Illegal data value'
    case 0x04:
      return 'Slave device failure'
    case 0x05:
      return 'Acknowledge'
    case 0x06:
      return 'Slave device busy'
    case 0x08:
      return 'Memory parity error'
    case 0x0a:
      return 'Gateway path unavailable'
    case 0x0b:
      return 'Gateway target failed to respond'
    default:
      return 'Unknown exception'
  }
}

/** Default end-of-frame silence for a given baud rate. */
export function defaultIdleGap(baudRate?: number): number {
  const charBits = 11 // 1 start + 8 data + 1 parity/none + 1 stop, worst case
  const computed = baudRate ? Math.ceil((3.5 * charBits * 1000) / baudRate) : 0
  return Math.max(computed, 30)
}

const crcOf = (buf: Buffer): number => crc16(buf)

function rtuFrame(slaveId: number, functionCode: number, body: Uint8Array): Buffer {
  const frame = Buffer.alloc(2 + body.length + 2)
  frame.writeUInt8(slaveId & 0xff, 0)
  frame.writeUInt8(functionCode & 0xff, 1)
  Buffer.from(body).copy(frame, 2)
  frame.writeUInt16LE(crcOf(frame.subarray(0, frame.length - 2)), frame.length - 2)
  return frame
}

function rtuCrcValid(buf: Buffer): boolean {
  if (buf.length < 4) return false
  return buf.readUInt16LE(buf.length - 2) === crcOf(buf.subarray(0, buf.length - 2))
}

function tcpFrame(
  transactionId: number,
  slaveId: number,
  functionCode: number,
  body: Uint8Array
): Buffer {
  const frame = Buffer.alloc(MBAP_LENGTH + 2 + body.length)
  frame.writeUInt16BE(transactionId & 0xffff, 0)
  frame.writeUInt16BE(0, 2) // protocol id
  frame.writeUInt16BE(2 + body.length, 4) // unit id + fc + body
  frame.writeUInt8(slaveId & 0xff, 6)
  frame.writeUInt8(functionCode & 0xff, 7)
  Buffer.from(body).copy(frame, MBAP_LENGTH + 2)
  return frame
}

/** A duplex stream: a `SerialPort` or a `net.Socket`. */
export interface ByteStream {
  write(chunk: Buffer): boolean
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  removeListener(event: 'data', listener: (chunk: Buffer) => void): unknown
}

let nextTransactionId = 1

/**
 * Send one custom-FC request and wait for its reply.
 *
 * Callers MUST serialise access to the stream — a raw transaction and a
 * library transaction cannot be in flight at the same time.
 */
export function rawTransaction(
  stream: ByteStream,
  mode: ModbusMode,
  options: RawTransactionOptions
): Promise<RawTransactionResult> {
  const { slaveId, functionCode, body, timeout } = options
  const idleGap = options.idleGapMs ?? 30

  const transactionId = nextTransactionId++ & 0xffff
  const request =
    mode === 'TCP'
      ? tcpFrame(transactionId, slaveId, functionCode, body)
      : rtuFrame(slaveId, functionCode, body)

  return new Promise<RawTransactionResult>((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let settled = false
    let idleTimer: NodeJS.Timeout | null = null

    const cleanup = (): void => {
      if (idleTimer) clearTimeout(idleTimer)
      clearTimeout(timeoutTimer)
      stream.removeListener('data', onData)
    }

    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const succeed = (raw: Buffer, pdu: Buffer): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ raw: new Uint8Array(raw), pdu: new Uint8Array(pdu) })
    }

    // Interpret whatever we have. Returns true when the reply is complete.
    const tryParse = (final: boolean): boolean => {
      if (mode === 'TCP') {
        if (buffer.length < MBAP_LENGTH + 2) return false
        const declared = buffer.readUInt16BE(4)
        const total = MBAP_LENGTH + declared
        if (buffer.length < total) return false
        const raw = buffer.subarray(0, total)
        const pdu = raw.subarray(MBAP_LENGTH + 1) // strip MBAP + unit id
        const fc = pdu.readUInt8(0)
        if (fc & 0x80) {
          fail(new ModbusExceptionError(functionCode, pdu.readUInt8(1)))
          return true
        }
        succeed(raw, pdu)
        return true
      }

      // --- RTU ---
      if (buffer.length < RTU_EXCEPTION_LENGTH) return false

      // Exception replies are a fixed 5 bytes; check that shape first so a
      // rejection does not have to wait out the idle gap.
      const excCandidate = buffer.subarray(0, RTU_EXCEPTION_LENGTH)
      if (
        excCandidate.readUInt8(1) === ((functionCode & 0xff) | 0x80) &&
        rtuCrcValid(excCandidate)
      ) {
        fail(new ModbusExceptionError(functionCode, excCandidate.readUInt8(2)))
        return true
      }

      // A complete positive reply is the shortest CRC-valid prefix. Checking
      // prefixes (rather than only the whole buffer) tolerates trailing noise
      // and back-to-back frames.
      for (let len = RTU_EXCEPTION_LENGTH; len <= buffer.length; len++) {
        const candidate = buffer.subarray(0, len)
        if (candidate.readUInt8(1) !== (functionCode & 0xff)) break
        if (rtuCrcValid(candidate)) {
          succeed(candidate, candidate.subarray(1, candidate.length - 2))
          return true
        }
      }

      if (final) {
        fail(
          new Error(
            `Malformed reply for function code 0x${functionCode.toString(16).toUpperCase()}: ` +
              `${buffer.length} bytes, no valid CRC (${bufToHex(buffer)})`
          )
        )
        return true
      }
      return false
    }

    const onData = (chunk: Buffer): void => {
      if (settled) return
      buffer = Buffer.concat([buffer, Buffer.from(chunk)])
      if (tryParse(false)) return
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => tryParse(true), idleGap)
    }

    const timeoutTimer = setTimeout(() => {
      if (buffer.length > 0) {
        // Something came back but never formed a frame — say so, it is far more
        // actionable than a bare timeout.
        tryParse(true)
      }
      fail(
        new Error(
          `Timed out after ${timeout}ms waiting for function code 0x${functionCode
            .toString(16)
            .toUpperCase()} reply` + (buffer.length ? ` (partial: ${bufToHex(buffer)})` : '')
        )
      )
    }, timeout)

    stream.on('data', onData)

    try {
      stream.write(request)
    } catch (err) {
      fail(new Error(`Failed to write request: ${(err as Error)?.message ?? String(err)}`))
    }
  })
}

function bufToHex(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim()
}
