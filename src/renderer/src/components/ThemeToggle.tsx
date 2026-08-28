import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { Theme } from '../hooks/useTheme'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

/**
 * Light/dark switch, modelled on shadcn/ui's mode-toggle: both icons occupy the
 * same box and are swapped with rotate+scale, so the button never reflows and
 * the change reads as one motion rather than two icons appearing.
 *
 * This is the primary consumer of the custom `dark:` variant defined in
 * main.css, which makes it the runtime smoke test for AC14: if `dark:` were
 * still keyed to `.dark` instead of `data-theme`, the icons would stop swapping
 * while the palette kept working — a visible, unmissable failure.
 *
 * `dark:bg-input/30` from the inventory does not reach this button: the
 * `dark:bg-background` in CONTROL_QUIET's chain is not used here, so the
 * neutralizer is spelled out locally instead.
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onToggle}
      title={label}
      className={cn(
        'relative size-8 shadow-none',
        // Neutralizes dark:bg-input/30 and dark:hover:bg-input/50, which
        // variant="outline" ships. Both modifiers have to be named: twMerge
        // resolves conflicts only within a matching modifier prefix.
        'dark:bg-background dark:hover:bg-muted'
      )}
    >
      <Sun
        size={16}
        strokeWidth={2}
        className="absolute rotate-0 scale-100 transition-transform duration-300 motion-reduce:transition-none dark:-rotate-90 dark:scale-0"
      />
      <Moon
        size={16}
        strokeWidth={2}
        className="absolute rotate-90 scale-0 transition-transform duration-300 motion-reduce:transition-none dark:rotate-0 dark:scale-100"
      />
      <span className="sr-only">{label}</span>
    </Button>
  )
}

export default ThemeToggle
