import React from 'react'

interface BrandMarkProps {
  size?: number
}

/**
 * The ModbusX glyph, inlined so it inherits theme tokens instead of shipping a
 * second raster copy of build/icons/icon.svg. Same geometry as the app icon:
 * two round-capped arcs bracketing a dot. The left arc follows the text colour
 * so it stays legible in both themes; the right arc and dot hold the brand
 * amber, which is identical in both.
 */
const BrandMark: React.FC<BrandMarkProps> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="none"
    aria-hidden="true"
    focusable="false"
    style={{ display: 'block', flex: '0 0 auto' }}
  >
    <circle cx="512" cy="512" r="78" fill="var(--c-brand)" />
    <path
      d="M330 340 A244 244 0 0 0 330 684"
      stroke="var(--c-text)"
      strokeWidth="104"
      strokeLinecap="round"
    />
    <path
      d="M694 340 A244 244 0 0 1 694 684"
      stroke="var(--c-brand)"
      strokeWidth="104"
      strokeLinecap="round"
    />
  </svg>
)

export default BrandMark
