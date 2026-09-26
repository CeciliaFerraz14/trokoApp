import { Link } from 'react-router'
import { Pin, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatWhen } from '@/lib/dates'
import { Badge } from '@/components/ui/Badge'
import { displayName } from '@/features/groups/api'
import { Audience } from '@/features/groups/audience'
import type { Group } from '@/types/database'
import type { AnnouncementItem } from './api'

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
  return (
    <Link
      to={`/avisos/${item.id}`}
      className={cn(
        'block rounded-2xl border bg-surface p-4 transition-colors hover:border-brand-blue',
        item.important ? 'border-warning/60 shadow-[inset_4px_0_0_var(--warning)]' : 'border-line',
        highlight && !item.important && 'border-brand-blue/60',
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
      <h3 className={cn('font-display text-lg leading-snug', highlight ? 'font-bold' : 'font-semibold')}>{item.title}</h3>
      {item.body && <p className="mt-1 line-clamp-3 break-words whitespace-pre-line text-muted">{item.body}</p>}
      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Audience groupIds={item.group_ids} groups={groups} className="min-w-0 flex-1" />
        {item.author && <span className="shrink-0 truncate">{displayName(item.author)}</span>}
      </div>
    </Link>
  )
}
