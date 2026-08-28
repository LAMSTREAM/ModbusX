// Local Modbus TCP slave — measurement harness for AC7 (density) and AC10 (grid perf).
//
//   node scripts/modbus-sim.js [port] [registers]
//   default: 127.0.0.1:5502, 200 holding registers
//
// Why this exists: AC7's density gate and AC10's perf gate both need a grid
// full enough to stress it. The attached test device caps at ~24 registers per
// read (measured: 24 OK, 32 Read Error at address 0x0000), which is nowhere
// near enough — with 24 cells every cell is fully visible in both builds and
// the density metric can never fail.
//
// The ceiling is 125, not the plan's original 200: FC 3's response PDU carries
// a ONE-BYTE byte-count field, so a single response tops out at 125 registers,
// and src/modbus/ issues each read as a single transaction with no chunking.
// 125 is therefore the hardest read this app can physically perform.
//
// Values are deterministic so the same read produces the same grid on the
// baseline build and the rewritten build — a changing value would show up as a
// diff in the style dump and be indistinguishable from a real regression.

const net = require('node:net')

const PORT = Number(process.argv[2] || 5502)
const COUNT = Number(process.argv[3] || 200)
const UNIT = 1

// Deterministic, and visibly varied so DEC_S / HEX / FLOAT / ASCII all render
// something distinguishable rather than a field of zeros.
const registers = Array.from({ length: COUNT }, (_, i) => (i * 1103 + 0x4142) & 0xffff)

function buildResponse(mbap, unit, fn, data) {
  const pdu = Buffer.concat([Buffer.from([fn]), data])
  const head = Buffer.alloc(7)
  mbap.copy(head, 0, 0, 4) // transaction id + protocol id
  head.writeUInt16BE(pdu.length + 1, 4) // length: unit + pdu
  head.writeUInt8(unit, 6)
  return Buffer.concat([head, pdu])
}

function exception(mbap, unit, fn, code) {
  return buildResponse(mbap, unit, fn | 0x80, Buffer.from([code]))
}

const server = net.createServer((socket) => {
  let buf = Buffer.alloc(0)

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])

    // MBAP header is 7 bytes; byte 4-5 is the length of (unit + PDU).
    while (buf.length >= 7) {
      const len = buf.readUInt16BE(4)
      const total = 6 + len
      if (buf.length < total) break

      const frame = buf.subarray(0, total)
      buf = buf.subarray(total)

      const mbap = frame.subarray(0, 6)
      const unit = frame.readUInt8(6)
      const fn = frame.readUInt8(7)

      if (unit !== UNIT && unit !== 0) {
        continue // not for us; a real bus would just stay quiet
      }

      // FC 3 / FC 4 — read holding / input registers.
      if (fn === 3 || fn === 4) {
        const addr = frame.readUInt16BE(8)
        const qty = frame.readUInt16BE(10)

        // Enforce the real protocol limits so the harness cannot accidentally
        // validate a read the app could never perform against real hardware.
        if (qty < 1 || qty > 125) {
          socket.write(exception(mbap, unit, fn, 0x03)) // illegal data value
          console.error(
            `  FC${fn} addr=0x${addr.toString(16)} qty=${qty} -> ILLEGAL VALUE (max 125)`
          )
          continue
        }
        if (addr + qty > COUNT) {
          socket.write(exception(mbap, unit, fn, 0x02)) // illegal data address
          console.error(
            `  FC${fn} addr=0x${addr.toString(16)} qty=${qty} -> ILLEGAL ADDRESS (have ${COUNT})`
          )
          continue
        }

        const data = Buffer.alloc(1 + qty * 2)
        data.writeUInt8(qty * 2, 0)
        for (let i = 0; i < qty; i++) data.writeUInt16BE(registers[addr + i], 1 + i * 2)
        socket.write(buildResponse(mbap, unit, fn, data))
        console.error(`  FC${fn} addr=0x${addr.toString(16)} qty=${qty} -> OK`)
        continue
      }

      // FC 6 — write single register.
      if (fn === 6) {
        const addr = frame.readUInt16BE(8)
        const value = frame.readUInt16BE(10)
        if (addr >= COUNT) {
          socket.write(exception(mbap, unit, fn, 0x02))
          continue
        }
        registers[addr] = value
        socket.write(buildResponse(mbap, unit, fn, frame.subarray(8, 12)))
        console.error(`  FC6 addr=0x${addr.toString(16)} value=${value} -> OK`)
        continue
      }

      // FC 16 — write multiple registers.
      if (fn === 16) {
        const addr = frame.readUInt16BE(8)
        const qty = frame.readUInt16BE(10)
        if (addr + qty > COUNT) {
          socket.write(exception(mbap, unit, fn, 0x02))
          continue
        }
        for (let i = 0; i < qty; i++) registers[addr + i] = frame.readUInt16BE(13 + i * 2)
        socket.write(buildResponse(mbap, unit, fn, frame.subarray(8, 12)))
        console.error(`  FC16 addr=0x${addr.toString(16)} qty=${qty} -> OK`)
        continue
      }

      socket.write(exception(mbap, unit, fn, 0x01)) // illegal function
      console.error(`  FC${fn} -> ILLEGAL FUNCTION`)
    }
  })

  socket.on('error', (e) => console.error('  socket error:', e.message))
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(
    `modbus-sim: listening on 127.0.0.1:${PORT}, unit ${UNIT}, ${COUNT} holding registers ` +
      `(FC 3/4 capped at the protocol's 125 per read)`
  )
})
