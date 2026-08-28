// TEMPORARY — the inline style objects the four sections shared while they all
// lived in ModbusDebugger.tsx. Hoisted verbatim by the Step 9 mechanical split
// so the extracted sections stay byte-identical to the pre-split render.
//
// Each constant dies with the step that ports its section to Tailwind
// (Steps 11-15). The file is gone by Step 16, which is also what AC4's
// `grep -rn -- "--c-"` guarantees.

export const inputBase = {
  padding: '0 10px',
  height: '36px',
  borderRadius: '6px',
  border: '1px solid var(--c-border)',
  fontSize: '13px',
  color: 'var(--c-text)',
  background: 'var(--c-bg)',
  transition: 'border 0.2s',
  boxSizing: 'border-box' as const
}

export const labelStyle = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--c-text)',
  marginBottom: '6px',
  display: 'block'
}

export const rowStyle = {
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-end',
  flexWrap: 'wrap' as const
}

export const flexFixed = (w: string): { flex: string } => ({ flex: `0 0 ${w}` })

export const flexGrow = { flex: '1 1 120px' }

export const clearBtnStyle = {
  background: 'transparent',
  border: 'none',
  fontSize: '11px',
  cursor: 'pointer',
  color: 'var(--c-text-sub)'
}
