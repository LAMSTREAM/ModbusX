import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'modbusx_theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const systemTheme = (): Theme => (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light')

const storedTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    // localStorage can throw outright (private mode, blocked site data).
    return null
  }
}

interface UseTheme {
  /** The theme actually in effect. */
  theme: Theme
  /** True while following the OS because no explicit choice has been made. */
  isSystem: boolean
  toggleTheme: () => void
}

/**
 * Resolves the active theme and reflects it onto `<html data-theme>`, which is
 * what the palette in main.css keys off.
 *
 * An explicit choice is remembered and wins in both directions. With no stored
 * choice the OS setting is followed live, so changing the system theme while
 * the app is open updates it without a restart.
 */
export function useTheme(): UseTheme {
  const [explicit, setExplicit] = useState<Theme | null>(storedTheme)
  const [system, setSystem] = useState<Theme>(systemTheme)

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return undefined
    const onChange = (e: MediaQueryListEvent): void => setSystem(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = explicit ?? system

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not fatal — the choice just will not survive a restart.
    }
    setExplicit(next)
  }, [theme])

  return { theme, isSystem: explicit === null, toggleTheme }
}
