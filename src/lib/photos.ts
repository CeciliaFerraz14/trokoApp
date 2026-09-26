// Fotos privadas (muro y avisos): se reducen en el móvil, se suben con una
// miniatura al lado y se muestran con URLs firmadas temporales.
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image'

export type PhotoBucket = 'wall' | 'announcements'

/** Las URLs firmadas duran una semana (la caché offline también) */
export const SIGNED_TTL = 60 * 60 * 24 * 7

export const MAX_PHOTOS = 6

/** Foto guardada con sus URLs firmadas para mostrarla */
export interface SignedPhoto {
  id: string
  path: string
  width: number
  height: number
  position: number
  /** URL firmada de la miniatura (640 px) */
  thumbUrl: string | null
  /** URL firmada de la foto grande (1600 px); solo si es la única */
  url: string | null
}

/** Miniatura guardada junto a la foto: <id>.jpg → <id>_t.jpg */
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '_t.jpg')

/** Firma rutas de un bucket privado en una sola llamada */
export async function signPaths(bucket: PhotoBucket, paths: string[]) {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_TTL)
  if (error) throw error
  for (const r of data ?? []) if (r.signedUrl && r.path) urls.set(r.path, r.signedUrl)
  return urls
}

type PhotoRow = Omit<SignedPhoto, 'url' | 'thumbUrl'>

/**
 * Añade las URLs firmadas a las fotos de varios elementos (publicaciones,
 * avisos). Una sola foto se ve grande; varias, en cuadrícula de miniaturas.
 */
export async function signPhotoSets(bucket: PhotoBucket, sets: PhotoRow[][]): Promise<SignedPhoto[][]> {
  const paths = sets.flatMap((photos) => photos.map((p) => (photos.length === 1 ? p.path : thumbPath(p.path))))
  const urls = await signPaths(bucket, paths)
  return sets.map((photos) =>
    [...photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        ...p,
        url: photos.length === 1 ? (urls.get(p.path) ?? null) : null,
        thumbUrl: urls.get(photos.length === 1 ? p.path : thumbPath(p.path)) ?? null,
      })),
  )
}

/**
 * Reduce y sube las fotos (grande de 1600 px + miniatura de 640 px) a
 * <bucket>/<folder>/<id>.jpg. Devuelve las filas para guardar y las rutas
 * subidas (para deshacerlo si algo falla después).
 */
export async function uploadPhotos(
  bucket: PhotoBucket,
  folder: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
) {
  const photos: { id: string; path: string; width: number; height: number; position: number }[] = []
  const uploaded: string[] = []
  try {
    for (const [i, file] of files.entries()) {
      onProgress?.(i, files.length)
      const id = crypto.randomUUID()
      const path = `${folder}/${id}.jpg`
      const full = await compressImage(file, { maxSize: 1600, quality: 0.8 })
      const thumb = await compressImage(file, { maxSize: 640, quality: 0.75 })
      for (const [p, blob] of [
        [path, full.blob],
        [thumbPath(path), thumb.blob],
      ] as const) {
        const { error } = await supabase.storage.from(bucket).upload(p, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        uploaded.push(p)
      }
      photos.push({ id, path, width: full.width, height: full.height, position: i })
    }
    onProgress?.(files.length, files.length)
    return { photos, uploaded }
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(bucket).remove(uploaded)
    throw err
  }
}

/** Borra los archivos de unas fotos (grande y miniatura) */
export async function removePhotoFiles(bucket: PhotoBucket, photos: { path: string }[]) {
  const files = photos.flatMap((p) => [p.path, thumbPath(p.path)])
  if (files.length) await supabase.storage.from(bucket).remove(files)
}
