import { useState, type CSSProperties } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { WallPhoto } from './api'
import { Lightbox } from './Lightbox'

/** Fotos de una publicación: 1 grande, 2 en pareja, 3 en mosaico, 4+ en 2×2 con "+N" */
export function PhotoGrid({ photos }: { photos: WallPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!photos.length) return null
  const shown = photos.slice(0, 4)
  const extra = photos.length - shown.length

  const tile = (p: WallPhoto, i: number, className = '', style?: CSSProperties) => (
    <button
      key={p.id}
      type="button"
      style={style}
      onClick={() => setOpen(i)}
      aria-label={`Ver foto ${i + 1} de ${photos.length}`}
      className={cn('relative block overflow-hidden bg-surface-2', className)}
    >
      {p.thumbUrl ? (
        <img src={p.thumbUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <ImageOff className="absolute inset-0 m-auto size-6 text-muted" aria-hidden />
      )}
      {i === 3 && extra > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/55 font-display text-3xl font-bold text-white">+{extra}</span>
      )}
    </button>
  )

  return (
    <>
      {photos.length === 1 ? (
        // Su proporción real (reserva el hueco antes de cargar), sin pasar de 28rem de alto
        tile(photos[0], 0, 'block max-h-[28rem] w-full rounded-xl', {
          aspectRatio: `${photos[0].width} / ${Math.min(photos[0].height, photos[0].width * 1.25)}`,
        })
      ) : (
        <div className={cn('grid gap-1 overflow-hidden rounded-xl', photos.length === 3 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2')}>
          {/* Con 3 fotos la primera ocupa toda la columna izquierda */}
          {shown.map((p, i) => tile(p, i, photos.length === 3 && i === 0 ? 'row-span-2' : 'aspect-square'))}
        </div>
      )}
      {open !== null && (
        <Lightbox photos={photos.map((p) => ({ path: p.path, url: p.url }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  )
}
