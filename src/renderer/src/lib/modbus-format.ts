import type { AddressFormat, DataFormat } from './modbus-config'

export const minDelay = async <T>(promise: Promise<T>, ms = 200): Promise<T> => {
  const [res] = await Promise.all([promise, new Promise((r) => setTimeout(r, ms))])
  return res
}

/**
 * Render a WIRE address for display, shifted by the user's base offset.
 *
 * `base` is added, not subtracted: callers hold protocol addresses and the user
 * reads offset ones. The inverse (display -> wire) lives in `toWireAddress`.
 */
export const formatAddress = (addr: number, fmt: AddressFormat, base = 0): string => {
  const shown = addr + base
  return fmt === 'HEX' ? `${shown.toString(16).toUpperCase().padStart(4, '0')}` : shown.toString()
}

/**
 * Parse what the user typed into a wire address, undoing the base offset.
 * Returns NaN when the text is not a valid number in the current radix, which
 * is what the caller checks before sending anything.
 */
export const toWireAddress = (text: string, fmt: AddressFormat, base = 0): number => {
  const parsed = parseInt(text, fmt === 'HEX' ? 16 : 10)
  return Number.isNaN(parsed) ? NaN : parsed - base
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// Robust Buffer Handling: Handles Uint8Array, Array, and Electron IPC Buffer objects
export const buf2hex = (input: unknown) => {
  if (!input) return ''

  let arr: Iterable<number> | ArrayLike<number> = []

  if (input instanceof Uint8Array || Array.isArray(input)) {
    arr = input as ArrayLike<number>
  } else if (typeof input === 'object') {
    const { data } = input as { data?: unknown }
    if (Array.isArray(data)) {
      // Electron IPC serialized Buffer: { type: 'Buffer', data: [...] }
      arr = data as number[]
    } else {
      // Array-like objects
      arr = Array.from(input as ArrayLike<number>)
    }
  }

  return Array.from(arr)
    .map((b) => (b as number).toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

export const parseFC = (input: string): number => {
  const s = String(input).trim()
  if (s.toLowerCase().startsWith('0x')) return parseInt(s, 16)
  return parseInt(s, 10)
}

export const formatValue = (
  value: number,
  nextValue: number | undefined,
  format: DataFormat
): string => {
  switch (format) {
    case 'HEX':
      return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
    case 'DEC_S':
      return (value > 32767 ? value - 65536 : value).toString()
    case 'BIN':
      return value.toString(2).padStart(16, '0')
    case 'UINT32': {
      const u32 = ((value << 16) | (nextValue || 0)) >>> 0
      return u32.toString()
    }
    case 'FLOAT': {
      const buf = new ArrayBuffer(4)
      const view = new DataView(buf)
      view.setUint16(0, value, false)
      view.setUint16(2, nextValue || 0, false)
      return view.getFloat32(0, false).toFixed(4)
    }
    case 'ASCII': {
      const hi = (value >> 8) & 0xff
      const lo = value & 0xff
      return (
        (hi > 31 && hi < 127 ? String.fromCharCode(hi) : '.') +
        (lo > 31 && lo < 127 ? String.fromCharCode(lo) : '.')
      )
    }
    case 'DEC_U':
    default:
      return value.toString()
  }
}

/** Formats that occupy two consecutive registers. */
export const is32BitFormat = (f: DataFormat): boolean => f === 'UINT32' || f === 'FLOAT'

/**
 * The inverse of `formatValue`: turn edited text back into register words.
 *
 * Returns one word for the 16-bit formats and two (big-endian, high word
 * first) for UINT32 and FLOAT, mirroring how `formatValue` reads them. Returns
 * null when the text cannot be represented, which the caller treats as "reject
 * the edit" rather than writing a garbage register.
 *
 * Every branch is deliberately paired with its `formatValue` case — if one
 * side gains a format the other has to, or a value will round-trip wrong.
 */
export const parseValue = (text: string, format: DataFormat): number[] | null => {
  const s = text.trim()
  if (s === '') return null

  const u16 = (n: number): number[] | null =>
    Number.isFinite(n) && n >= 0 && n <= 0xffff ? [n] : null

  switch (format) {
    case 'HEX': {
      const body = s.toLowerCase().startsWith('0x') ? s.slice(2) : s
      if (!/^[0-9a-fA-F]+$/.test(body)) return null
      return u16(parseInt(body, 16))
    }
    case 'BIN': {
      const body = s.toLowerCase().startsWith('0b') ? s.slice(2) : s
      // Underscores and spaces are tolerated so a 16-digit string can be
      // typed in nibbles without being rejected.
      const bits = body.replace(/[\s_]/g, '')
      if (!/^[01]{1,16}$/.test(bits)) return null
      return u16(parseInt(bits, 2))
    }
    case 'DEC_S': {
      if (!/^-?\d+$/.test(s)) return null
      const n = parseInt(s, 10)
      if (n < -32768 || n > 32767) return null
      return [n < 0 ? n + 0x10000 : n]
    }
    case 'ASCII': {
      // One register is exactly two bytes. A shorter string pads with NUL so
      // clearing a cell is expressible; anything longer would silently lose
      // characters, so it is rejected instead.
      const bytes = Array.from(s, (c) => c.charCodeAt(0))
      if (bytes.length > 2 || bytes.some((b) => b > 0xff)) return null
      const hi = bytes[0] ?? 0
      const lo = bytes[1] ?? 0
      return [((hi << 8) | lo) & 0xffff]
    }
    case 'UINT32': {
      if (!/^\d+$/.test(s)) return null
      const n = Number(s)
      if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null
      return [(n >>> 16) & 0xffff, n & 0xffff]
    }
    case 'FLOAT': {
      const n = Number(s)
      if (!Number.isFinite(n)) return null
      const view = new DataView(new ArrayBuffer(4))
      view.setFloat32(0, n, false)
      return [view.getUint16(0, false), view.getUint16(2, false)]
    }
    case 'DEC_U':
    default: {
      if (!/^\d+$/.test(s)) return null
      return u16(parseInt(s, 10))
    }
  }
}
