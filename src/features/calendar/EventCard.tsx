import { Link } from 'react-router'
import { CircleCheck, CircleHelp, CircleX, MapPin, Repeat } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatEventTime } from '@/lib/dates'
import { Badge } from '@/components/ui/Badge'
import { Audience } from '@/features/groups/audience'
import type { AttendanceStatus, Group } from '@/types/database'
import { CATEGORIES } from './categories'
import type { EventItem } from './api'

export const STATUS_UI: Record<AttendanceStatus, { label: string; short: string; icon: typeof CircleCheck; tone: 'success' | 'warning' | 'neutral' }> = {
  yes: { label: 'Voy', short: 'Vas', icon: CircleCheck, tone: 'success' },
  maybe: { label: 'Quizá', short: 'Quizá', icon: CircleHelp, tone: 'warning' },
  no: { label: 'No voy', short: 'No vas', icon: CircleX, tone: 'neutral' },
}

export function EventCard({ event, groups }: { event: EventItem; groups: Map<string, Group> }) {
  const cat = CATEGORIES[event.category]
  const Icon = cat.icon
  const status = event.myStatus ? STATUS_UI[event.myStatus] : null
  return (
    <Link
      to={`/calendario/${event.id}`}
      className={cn(
        'flex gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-brand-blue',
        event.cancelled && 'opacity-60',
      )}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl text-brand-black"
        style={{ backgroundColor: cat.color }}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-semibold text-fg">{formatEventTime(event)}</span>
          <span>· {cat.label}</span>
          {event.series_id && <Repeat className="size-3.5" aria-label="Se repite" />}
        </div>
        <h3 className={cn('truncate font-display text-lg leading-snug font-semibold', event.cancelled && 'line-through')}>{event.title}</h3>
        {event.location && (
          <p className="flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          {event.cancelled ? (
            <Badge tone="danger">Cancelado</Badge>
          ) : (
            status && (
              <Badge tone={status.tone}>
                <status.icon className="size-3" aria-hidden /> {status.short}
              </Badge>
            )
          )}
          <Audience groupIds={event.group_ids} groups={groups} className="min-w-0" />
        </div>
      </div>
    </Link>
  )
}
