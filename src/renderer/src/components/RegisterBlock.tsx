import React, { memo, useState } from 'react'
import type { AddressFormat, DataFormat } from '../lib/modbus-config'
import { formatAddress, formatValue } from '../lib/modbus-format'
import { cn } from '../lib/utils'

// Module-level and frozen. The grid renders these hundreds of times per poll,
// so each string is merged ONCE at module load rather than per render.
//
// Never interpolate a per-cell value into any of these. `twMerge` memoizes on
// the joined string (LRU, ~500 entries); three constants across 200 cells is
// three cache entries and 197 hits, but interpolating an address or a value
// would thrash the cache and silently evaporate the mitigation.
const CELL_BASE =
  'relative flex min-w-[60px] cursor-default flex-col items-center rounded-sm border px-0.5 py-1 select-none'
const CELL_IDLE = cn(CELL_BASE, 'border-border bg-cell dark:bg-cell')
const CELL_EDITING = cn(CELL_BASE, 'border-action bg-background dark:bg-background')
const CELL_SELECTED = cn(CELL_BASE, 'border-selection-border bg-selection dark:bg-selection')

// A bare <input>, NOT shadcn's <Input> — deviation D-2, signed off by the user.
// shadcn's Input is a plain <input> plus a cn() call and a data-slot attribute:
// it contributes nothing the cell needs, and it would execute
// twMerge(clsx(...)) on every render of every cell. Everything else in this
// app still uses <Input>.
//
// Plain template strings rather than cn(), deliberately: a bare <input> has no
// base class list to merge against and no two classes here conflict. The
// CONTROL* constants in lib/ui-density.ts do use cn(), because they layer.
//
// `md:text-[Npx]` is not redundant — see Rule 1 in lib/ui-density.ts.
const CELL_INPUT_BASE =
  'w-full border-0 bg-transparent p-0 text-center font-mono font-semibold shadow-none outline-none focus:outline-none'
// The blue tint used to mean "read-only". Every format round-trips now, so it
// means "this cell spans TWO registers" instead — still load-bearing, because
// editing a UINT32 or FLOAT cell rewrites the register after it as well and
// nothing else on screen says so.
const CELL_INPUT_16 = `${CELL_INPUT_BASE} text-[13px] md:text-[13px] text-foreground`
const CELL_INPUT_32 = `${CELL_INPUT_BASE} text-[14px] md:text-[14px] text-action`

export interface RegisterBlockProps {
  address: number
  value: number
  nextValue?: number
  format: DataFormat
  addrFormat: AddressFormat
  /** Display offset applied to the address label. */
  addrBase: number
  index: number
  isSelected: boolean
  onSelectionStart: (index: number) => void
  onSelectionEnter: (index: number) => void
  onEdit: (addr: number, newVal: string) => void
}

const RegisterBlock = memo<RegisterBlockProps>(
  ({
    address,
    value,
    nextValue,
    format,
    addrFormat,
    addrBase,
    index,
    isSelected,
    onSelectionStart,
    onSelectionEnter,
    onEdit
  }) => {
    const [editingVal, setEditingVal] = useState<string>('')
    const [isEditing, setIsEditing] = useState(false)

    // Every format round-trips now — parseValue is the exact inverse of
    // formatValue, including the two-register UINT32 and FLOAT — so no format
    // is read-only any more.
    const is32Bit = format === 'FLOAT' || format === 'UINT32'
    const addressLabel = is32Bit
      ? `${formatAddress(address, addrFormat, addrBase)}-${formatAddress(address + 1, addrFormat, addrBase).slice(-2)}`
      : formatAddress(address, addrFormat, addrBase)
    const displayVal = isEditing ? editingVal : formatValue(value, nextValue, format)

    const handleFocus = () => {
      setIsEditing(true)
      // Seed the buffer with what the cell is ALREADY showing. It used to seed
      // `value.toString()` — plain decimal — with a special case for HEX, so
      // focusing a BIN or ASCII or FLOAT cell swapped the display for a decimal
      // number that parseValue would then refuse on blur. formatValue is the
      // exact inverse of parseValue, so what you see is always what you edit.
      setEditingVal(formatValue(value, nextValue, format))
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingVal(e.target.value)
    }

    const handleBlur = () => {
      if (isEditing) {
        onEdit(address, editingVal)
        setIsEditing(false)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      if (e.key === 'Escape') setIsEditing(false)
    }

    const handleMouseDown = () => onSelectionStart(index)
    const handleMouseEnter = () => onSelectionEnter(index)
    const handleClick = () => {
      if (!isEditing) handleFocus()
    }

    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        className={isSelected ? CELL_SELECTED : isEditing ? CELL_EDITING : CELL_IDLE}
      >
        <div
          className={cn(
            'mb-0.5 font-mono text-[10px]',
            isSelected ? 'text-selection-foreground' : 'text-faint'
          )}
        >
          {addressLabel}
        </div>
        <input
          value={displayVal}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={is32Bit ? CELL_INPUT_32 : CELL_INPUT_16}
        />
      </div>
    )
  },
  (prev, next) => {
    return (
      prev.value === next.value &&
      prev.nextValue === next.nextValue &&
      prev.isSelected === next.isSelected &&
      prev.format === next.format &&
      prev.address === next.address &&
      prev.addrFormat === next.addrFormat &&
      prev.addrBase === next.addrBase
    )
  }
)

RegisterBlock.displayName = 'RegisterBlock'

// Every prop above is either compared by the memo comparator or provably stable.
// Adding one without classifying it here fails `pnpm typecheck:web`.
//
// This is KEY-based on purpose. The obvious value-based form —
// `RegisterBlockProps extends Compared & Stable ? true : never` — is inert:
// `extends` is structural subtyping, so a type with an EXTRA property still
// extends one with fewer. Adding `foo` leaves the conditional resolving to
// `true` and typecheck passing. It only failed when a prop was REMOVED, the
// opposite of the failure mode it exists to catch. Here `keyof` picks up the
// new key, `Exclude` leaves it behind, and the assignment fails. Optional props
// are caught too, because `keyof` includes them. The tuple wrapping on both
// sides stops distribution over a union, so two props added at once also fail.
type Compared = Pick<
  RegisterBlockProps,
  'value' | 'nextValue' | 'isSelected' | 'format' | 'address' | 'addrFormat' | 'addrBase'
>
type Stable = Pick<RegisterBlockProps, 'index' | 'onSelectionStart' | 'onSelectionEnter' | 'onEdit'>
type Unaccounted = Exclude<keyof RegisterBlockProps, keyof Compared | keyof Stable>
const cellPropsAccountedFor: [Unaccounted] extends [never]
  ? true
  : ['UNACCOUNTED PROP:', Unaccounted] = true
void cellPropsAccountedFor

export default RegisterBlock
