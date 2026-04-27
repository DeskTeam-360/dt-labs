'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'deskteam-theme'

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyHtmlClass(isDark: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

type ThemeContextValue = {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useLayoutEffect(() => {
    const m = getStoredMode()
    setModeState(m)
    const r = resolveMode(m)
    setResolved(r)
    applyHtmlClass(r === 'dark')
  }, [])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r = resolveMode('system')
      setResolved(r)
      applyHtmlClass(r === 'dark')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* ignore */
    }
    const r = resolveMode(m)
    setResolved(r)
    applyHtmlClass(r === 'dark')
  }, [])

  const value = useMemo(() => ({ mode, setMode, resolved }), [mode, setMode, resolved])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
