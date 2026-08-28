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
