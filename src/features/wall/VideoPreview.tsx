import { ExternalLink, Play } from 'lucide-react'
import type { VideoLink } from './video'

const LABELS = { instagram: 'Ver en Instagram', tiktok: 'Ver en TikTok', link: 'Abrir vídeo' }

/** Vista previa ligera: miniatura de YouTube (sin reproductor incrustado) o tarjeta con enlace */
export function VideoPreview({ video }: { video: VideoLink }) {
  if (video.kind === 'youtube') {
    return (
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-xl bg-black" aria-label="Ver vídeo en YouTube">
        <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full object-cover opacity-90 group-hover:opacity-100" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-black/70 text-white">
            <Play className="size-7 translate-x-0.5" fill="currentColor" aria-hidden />
          </span>
        </span>
      </a>
    )
  }
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 hover:border-brand-blue"
    >
      <Play className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{LABELS[video.kind]}</span>
        <span className="block truncate text-sm text-muted">{video.host}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
    </a>
  )
}
