import React from 'react'
import { Moon, Sun } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

/**
 * Light/dark switch, modelled on shadcn/ui's mode-toggle: both icons occupy the
 * same box and are swapped with rotate+scale (see `.theme-toggle` in main.css).
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button type="button" className="theme-toggle" onClick={onToggle} title={label}>
      <Sun size={16} strokeWidth={2} className="theme-toggle__icon theme-toggle__icon--sun" />
      <Moon size={16} strokeWidth={2} className="theme-toggle__icon theme-toggle__icon--moon" />
      <span className="sr-only">{label}</span>
    </button>
  )
}

export default ThemeToggle
