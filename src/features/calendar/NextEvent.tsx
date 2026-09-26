import { Link } from 'react-router'
import { differenceInCalendarDays, format, startOfToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { formatEventTime } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'
import { CATEGORIES } from './categories'
import { useEvents, useSetAttendance } from './api'

const WEEK_MS = 1000 * 60 * 60 * 24 * 7

/**
 * Próximo evento de la semana, para la cabecera azul de Avisos: tarjeta negra
 * con "Voy" para confirmar sin abrirlo (misma consulta que "Próximos").
 */
export function NextEvent() {
  const events = useEvents(startOfToday())
  const attend = useSetAttendance()
  const toast = useToast()
  const now = Date.now()
  const next = events.data?.find(
    (e) => !e.cancelled && new Date(e.ends_at ?? e.starts_at).getTime() >= now && new Date(e.starts_at).getTime() - now < WEEK_MS,
  )
  if (!next) return null
  const cat = CATEGORIES[next.category]
  const going = next.myStatus === 'yes'

  const toggle = () =>
    attend.mutate(
      { eventId: next.id, status: going ? null : 'yes' },
      { onSuccess: () => toast(going ? 'Respuesta quitada' : '¡Apuntado!'), onError: (e) => toast(errorMessage(e), 'error') },
    )

  return (
    <div className="flex items-center gap-3 rounded-[1.5rem] bg-brand-black p-3 text-white">
      <Link to={`/calendario/${next.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-brand-black" style={{ backgroundColor: cat.color }} aria-hidden>
          <cat.icon className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-extrabold tracking-wider text-brand-blue uppercase">
            Próximo · {shortDay(next.starts_at)}
          </span>
          <span className="block truncate font-display text-lg leading-snug font-semibold">{next.title}</span>
          <span className="block truncate text-sm text-white/70">
            {formatEventTime(next)}
            {next.location && ` · ${next.location}`}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={toggle}
        disabled={attend.isPending}
        aria-pressed={going}
        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-brand-blue px-4 font-display font-semibold text-brand-black disabled:opacity-60"
      >
        {going && <Check className="size-4" aria-hidden />}
        {going ? 'Vas' : 'Voy'}
      </button>
    </div>
  )
}

/** "Hoy", "Mañana" o "mié 30 sep": cabe en una línea */
function shortDay(iso: string) {
  const d = new Date(iso)
  const diff = differenceInCalendarDays(d, new Date())
  if (diff <= 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  return format(d, 'EEE d MMM', { locale: es })
}
