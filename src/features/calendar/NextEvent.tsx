import { Link } from 'react-router'
import { startOfToday } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { formatDayHeading, formatEventTime } from '@/lib/dates'
import { CATEGORIES } from './categories'
import { useEvents } from './api'

const WEEK_MS = 1000 * 60 * 60 * 24 * 7

/** Tarjeta con el próximo evento de la semana (misma consulta que "Próximos" del calendario) */
export function NextEvent() {
  const events = useEvents(startOfToday())
  const now = Date.now()
  const next = events.data?.find(
    (e) => !e.cancelled && new Date(e.ends_at ?? e.starts_at).getTime() >= now && new Date(e.starts_at).getTime() - now < WEEK_MS,
  )
  if (!next) return null
  const cat = CATEGORIES[next.category]
  return (
    <Link
      to={`/calendario/${next.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand-blue"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl text-brand-black" style={{ backgroundColor: cat.color }} aria-hidden>
        <cat.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wider text-muted uppercase">Próximo</p>
        <p className="truncate font-display text-lg leading-snug font-semibold">{next.title}</p>
        <p className="truncate text-sm text-muted">
          {formatDayHeading(next.starts_at)} · {formatEventTime(next)}
          {next.location && ` · ${next.location}`}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}
