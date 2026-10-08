import { useSyncExternalStore } from 'react'

/** Tamaños de letra de la app: escala del rem (toda la interfaz usa rem, así que crece entera) */
export const FONT_SIZES = [
  { value: 'small', label: 'Pequeña', scale: 0.875 },
  { value: 'normal', label: 'Normal', scale: 1 },
  { value: 'large', label: 'Grande', scale: 1.125 },
  { value: 'xlarge', label: 'Muy grande', scale: 1.25 },
] as const

export type FontSize = (typeof FONT_SIZES)[number]['value']
// index.html lee esta misma clave antes de pintar para evitar el salto
const KEY = 'troko-font-size'
const listeners = new Set<() => void>()

function read(): FontSize {
  try {
    const v = localStorage.getItem(KEY)
    return FONT_SIZES.some((s) => s.value === v) ? (v as FontSize) : 'normal'
  } catch {
    return 'normal'
  }
}

let current = read()

function setFontSize(size: FontSize) {
  current = size
  const { scale } = FONT_SIZES.find((s) => s.value === size)!
  document.documentElement.style.fontSize = scale === 1 ? '' : `${scale * 100}%`
  try {
    localStorage.setItem(KEY, size)
  } catch {
    /* modo privado: solo dura esta sesión */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tamaño de letra elegido en este dispositivo (compartido por todos los componentes) */
export function useFontSize() {
  const size = useSyncExternalStore(subscribe, () => current)
  return [size, setFontSize] as const
}
