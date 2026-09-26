// Limpia los logos originales (capturas con margen y artefactos JPEG) y genera
// versiones con fondo transparente en el azul de marca exacto.
//   logos/logo.png         -> public/logo-isotipo.png      (flor + círculo)
//   logos/nombre_logo.png  -> public/logo-troko-bloco.png  (logotipo completo)
// Uso: node scripts/prepare-logos.mjs   (después: npm run icons)
import sharp from 'sharp'

const BRAND_BLUE = [0x6c, 0xb8, 0xe6]

async function extract(input, output, { scale, pad }) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const out = Buffer.alloc(w * h * 4)
  let x0 = w, x1 = 0, y0 = h, y1 = 0

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    // Solo cuenta como logo lo que es claramente azul (descarta el margen blanco/gris)
    const blueness = b - r
    const bright = Math.max(r, g, b)
    let a = 0
    if (blueness > 30 && bright > 50) a = Math.min(1, Math.max(0, (bright - 50) / 110))
    out[i * 4] = BRAND_BLUE[0]
    out[i * 4 + 1] = BRAND_BLUE[1]
    out[i * 4 + 2] = BRAND_BLUE[2]
    out[i * 4 + 3] = Math.round(a * 255)
    if (a > 0.5) {
      const x = i % w, y = Math.floor(i / w)
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
  }

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const p = Math.round(Math.max(cw, ch) * pad)
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: cw, height: ch })
    .extend({ top: p, bottom: p, left: p, right: p, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: Math.round((cw + 2 * p) * scale), kernel: 'lanczos3' })
    // Un solo color + transparencia: la paleta indexada reduce mucho el peso
    .png({ palette: true, compressionLevel: 9 })
    .toFile(output)
  console.log('✔', output)
}

await extract('logos/logo.png', 'public/logo-isotipo.png', { scale: 1.4, pad: 0.02 })
await extract('logos/nombre_logo.png', 'public/logo-troko-bloco.png', { scale: 2.5, pad: 0.04 })
