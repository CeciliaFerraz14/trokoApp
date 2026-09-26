import { useState } from 'react'
import { Images } from 'lucide-react'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useGallery } from './api'
import { Lightbox } from './Lightbox'

/** Todas las fotos del grupo en cuadrícula */
export function Gallery({ groupId }: { groupId: string }) {
  const gallery = useGallery(groupId)
  const [open, setOpen] = useState<number | null>(null)

  if (gallery.isPending) return <SkeletonList count={2} className="h-40" />
  if (gallery.isError) return <ErrorState error={gallery.error} onRetry={() => gallery.refetch()} />
  if (!gallery.data.length) {
    return (
      <EmptyState icon={<Images className="size-8" />} title="Aún no hay fotos">
        Las fotos que se compartan en el muro aparecerán aquí.
      </EmptyState>
    )
  }

  const photos = gallery.data
  return (
    <>
      <p className="px-1 text-sm text-muted">{photos.length === 1 ? '1 foto' : `${photos.length} fotos`}</p>
      <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Ver foto ${i + 1}`} className="block aspect-square w-full bg-surface-2">
              {p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox
          photos={photos.map((p) => ({ path: p.path, postHref: `/muro/${groupId}/p/${p.post_id}` }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
