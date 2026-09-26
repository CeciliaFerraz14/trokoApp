import { useEffect, useMemo, useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { MAX_PHOTOS } from '@/lib/photos'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

/** Elegir hasta 6 fotos con vista previa (muro y avisos) */
export function PhotoPicker({ files, onChange, note }: { files: File[]; onChange: (files: File[]) => void; note?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // Vistas previas locales de las fotos elegidas
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const add = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (files.length + images.length > MAX_PHOTOS) toast(`Máximo ${MAX_PHOTOS} fotos`, 'error')
    onChange([...files, ...images].slice(0, MAX_PHOTOS))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted">
        Fotos ({files.length}/{MAX_PHOTOS})
      </p>
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {previews.map((url, i) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
              <img src={url} alt="" className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/70 text-white"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      {files.length < MAX_PHOTOS && (
        <Button type="button" variant="secondary" block icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
          Añadir fotos
        </Button>
      )}
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  )
}
