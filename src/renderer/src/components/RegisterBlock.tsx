import React, { memo, useState } from 'react'
import type { AddressFormat, DataFormat } from '../lib/modbus-config'
import { formatAddress, formatValue } from '../lib/modbus-format'

export interface RegisterBlockProps {
  address: number
  value: number
  nextValue?: number
  format: DataFormat
  addrFormat: AddressFormat
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
    index,
    isSelected,
    onSelectionStart,
    onSelectionEnter,
    onEdit
  }) => {
    const [editingVal, setEditingVal] = useState<string>('')
    const [isEditing, setIsEditing] = useState(false)

    const isReadOnly = format === 'FLOAT' || format === 'UINT32' || format === 'ASCII'
    const displayVal = isEditing ? editingVal : formatValue(value, nextValue, format)

    const is32Bit = format === 'FLOAT' || format === 'UINT32'
    const addressLabel = is32Bit
      ? `${formatAddress(address, addrFormat)}-${formatAddress(address + 1, addrFormat).slice(-2)}`
      : formatAddress(address, addrFormat)

    const handleFocus = () => {
      if (isReadOnly) return
      setIsEditing(true)
      if (format === 'HEX' && !value.toString(16).startsWith('0x')) {
        setEditingVal(`0x${value.toString(16).toUpperCase().padStart(4, '0')}`)
      } else {
        setEditingVal(value.toString())
      }
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
      if (!isEditing && !isReadOnly) handleFocus()
    }

    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        style={{
          background: isSelected
            ? 'var(--c-select-bg)'
            : isEditing
              ? 'var(--c-bg)'
              : 'var(--c-bg-cell)',
          border: isSelected
            ? '1px solid var(--c-select-border)'
            : isEditing
              ? '1px solid var(--c-accent)'
              : '1px solid var(--c-border)',
          borderRadius: '4px',
          padding: '4px 2px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          minWidth: '60px',
          cursor: 'default',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            fontSize: '10px',
            color: isSelected ? 'var(--c-select-fg)' : 'var(--c-text-mute)',
            marginBottom: '2px',
            fontFamily: 'monospace'
          }}
        >
          {addressLabel}
        </div>
        <input
          value={displayVal}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          readOnly={isReadOnly}
          style={{
            width: '100%',
            textAlign: 'center',
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
            color: isEditing ? 'var(--c-text)' : isReadOnly ? 'var(--c-accent)' : 'var(--c-text)',
            outline: 'none',
            fontSize: is32Bit ? '14px' : '13px',
            fontFamily: 'monospace',
            pointerEvents: isReadOnly ? 'none' : 'auto'
          }}
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
      prev.addrFormat === next.addrFormat
    )
  }
)

RegisterBlock.displayName = 'RegisterBlock'

export default RegisterBlock
