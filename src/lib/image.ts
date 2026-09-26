// Comprime y redimensiona imágenes en el navegador antes de subirlas,
// para no agotar el almacenamiento gratuito de Supabase.

export interface CompressOptions {
  /** Lado más largo en píxeles */
  maxSize?: number
  /** Calidad JPEG/WebP entre 0 y 1 */
  quality?: number
  /** Recorta al centro en cuadrado (avatares) */
  square?: boolean
}

export async function compressImage(file: Blob, { maxSize = 1600, quality = 0.8, square = false }: CompressOptions = {}) {
  // createImageBitmap respeta la orientación EXIF de las fotos del móvil
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height
  if (square) {
    const side = Math.min(sw, sh)
    sx = (sw - side) / 2
    sy = (sh - side) / 2
    sw = sh = side
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh))
  const width = Math.round(sw * scale)
  const height = Math.round(sh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tu navegador no permite procesar imágenes')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  return { blob, width, height }
}
