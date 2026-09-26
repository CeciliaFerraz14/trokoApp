import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'troko-theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Tema oscuro por defecto; el claro es opcional y se recuerda en este dispositivo */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* modo privado: no pasa nada */
    }
  }, [theme])
  return [theme, setTheme] as const
}
