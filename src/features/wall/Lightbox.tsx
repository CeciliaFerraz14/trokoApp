import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, X } from 'lucide-react'
import { useFullPhotoUrl } from './api'

export interface LightboxPhoto {
  path: string
  url?: string | null
  /** Enlace a la publicación (desde la galería) */
  postHref?: string
}

/** Visor de fotos a pantalla completa: flechas, deslizar y Escape */
export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: LightboxPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const photo = photos[index]
  const full = useFullPhotoUrl(photo?.path, photo?.url)
  const startX = useRef<number | null>(null)
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  })

  if (!photo) return null
  const many = photos.length > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current === null || !many) return
        const dx = e.clientX - startX.current
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        startX.current = null
      }}
    >
      <div className="flex items-center gap-2 px-2 pt-safe">
        <button onClick={onClose} aria-label="Cerrar" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
          <X className="size-6" />
        </button>
        {many && <span className="flex-1 text-center text-sm text-white/70">{index + 1} / {photos.length}</span>}
        {photo.postHref ? (
          <Link to={photo.postHref} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
            <MessageSquare className="size-4" /> Publicación
          </Link>
        ) : (
          <span className="w-11" />
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {full.data ? (
          <img src={full.data} alt="" className="max-h-full max-w-full object-contain select-none" draggable={false} />
        ) : (
          <Loader2 className="size-8 animate-spin text-white/60" aria-label="Cargando" />
        )}
        {many && (
          <>
            <button onClick={() => go(-1)} aria-label="Anterior" className="absolute left-1 grid size-12 place-items-center rounded-full bg-black/40 hover:bg-black/60">
              <ChevronLeft className="size-7" />
            </button>
            <button onClick={() => go(1)} aria-label="Siguiente" className="absolute right-1 grid size-12 place-items-center rounded-full bg-black/40 hover:bg-black/60">
              <ChevronRight className="size-7" />
            </button>
          </>
        )}
      </div>
      <div className="pb-safe" />
    </div>
  )
}
