import { useEffect, useState } from 'react'

/**
 * Teclado en pantalla: cuánto tapa por abajo (0 si no está). En iPhone y en
 * Android el teclado encoge solo la zona visible, y lo fijo abajo se queda detrás.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered > 80 ? covered : 0)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/**
 * true al bajar por la página y false al subir (o al volver arriba del todo),
 * como las barras de otras apps. `resetKey` (la ruta) la vuelve a mostrar.
 */
export function useHideOnScroll(resetKey: string) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    setHidden(false)
    let last = window.scrollY
    const onScroll = () => {
      const root = document.documentElement
      // El rebote de iPhone pasa del principio y del final: no cuenta como scroll
      const y = Math.min(Math.max(window.scrollY, 0), root.scrollHeight - window.innerHeight)
      const delta = y - last
      if (y < 64) setHidden(false)
      else if (delta > 8) setHidden(true)
      else if (delta < -8) setHidden(false)
      else return // movimientos pequeños: se acumulan hasta pasar el umbral
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [resetKey])
  return hidden
}
