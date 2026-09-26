// Detección de plataforma para las instrucciones de instalación.
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const isIOS =
  /iphone|ipad|ipod/i.test(ua) ||
  // iPadOS se presenta como Mac con pantalla táctil
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isAndroid = /android/i.test(ua)

/** En iOS, solo Safari puede añadir a la pantalla de inicio (salvo iOS 16.4+ con otros navegadores) */
export const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
