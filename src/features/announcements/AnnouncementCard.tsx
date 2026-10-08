import { Link } from 'react-router'
import { MessageCircle, Music, Pin, Play, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatWhen } from '@/lib/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { displayName } from '@/features/groups/api'
import { Audience } from '@/features/groups/audience'
import { parseVideo } from '@/features/wall/video'
import type { Group } from '@/types/database'
import type { AnnouncementItem } from './api'
import { BirthdayBanner } from './BirthdayBanner'

export function AnnouncementCard({
  item,
  groups,
  highlight,
}: {
  item: AnnouncementItem
  groups: Map<string, Group>
  /** Se muestra como "Nuevo" (no leído al abrir la pantalla) */
  highlight: boolean
}) {
  const link = parseVideo(item.link_url)
  return (
    <Link
      to={`/avisos/${item.id}`}
      className={cn(
        'block rounded-[1.4rem] border bg-surface p-4 transition-colors hover:border-brand-blue',
        item.important ? 'border-warning/60 shadow-[inset_4px_0_0_var(--warning)]' : highlight ? 'border-brand-blue/60' : 'border-(--card-border)',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {highlight && <Badge tone="brand">Nuevo</Badge>}
        {item.pinned && (
          <Badge>
            <Pin className="size-3" aria-hidden /> Fijado
          </Badge>
        )}
        {item.important && (
          <Badge tone="warning">
            <TriangleAlert className="size-3" aria-hidden /> Importante
          </Badge>
        )}
        <span className="ml-auto text-sm text-muted">{formatWhen(item.created_at)}</span>
      </div>
      {item.birthday_of && <BirthdayBanner person={item.birthday} />}
      <h3 className={cn('font-display text-lg leading-snug', highlight ? 'font-bold' : 'font-semibold')}>{item.title}</h3>
      {item.body && <p className="mt-1 line-clamp-3 break-words whitespace-pre-line text-muted">{item.body}</p>}
      {item.photos.length > 0 && (
        // Miniaturas (la tarjeta entera es el enlace; las fotos se abren en el detalle)
        <div className="mt-3 flex gap-1.5">
          {item.photos.slice(0, 3).map((p, i) => (
            <span key={p.id} className="relative size-20 overflow-hidden rounded-xl bg-surface-2">
              {p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
              {i === 2 && item.photos.length > 3 && (
                <span className="absolute inset-0 grid place-items-center bg-black/55 font-display text-lg font-bold text-white">+{item.photos.length - 3}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {link && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent">
          {link.kind === 'spotify' ? <Music className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {link.kind === 'spotify' ? 'Escuchar en Spotify' : link.kind === 'youtube' ? 'Vídeo de YouTube' : 'Enlace'}
        </p>
      )}
      {item.birthday_of && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <MessageCircle className="size-4" aria-hidden />
          {!item.commentCount ? 'Felicitar' : item.commentCount === 1 ? '1 felicitación' : `${item.commentCount} felicitaciones`}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Audience groupIds={item.group_ids} groups={groups} className="min-w-0 flex-1" />
        {item.author && (
          <span className="flex shrink-0 items-center gap-1.5 truncate">
            <Avatar name={item.author.full_name} url={item.author.avatar_url} size="sm" className="size-6 text-[0.65rem]" />
            {displayName(item.author)}
          </span>
        )}
      </div>
    </Link>
  )
}
