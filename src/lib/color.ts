/** Luminancia relativa (WCAG) de un color #rrggbb */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Sobre este fondo se lee mejor el texto blanco que el negro (p. ej. el morado de Timbau) */
export function needsLightText(hex: string) {
  return /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) < 0.179
}
