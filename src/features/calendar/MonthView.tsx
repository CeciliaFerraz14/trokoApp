import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from '@/components/ui/Button'
import { CATEGORIES } from './categories'
import type { EventItem } from './api'

const WEEK = { weekStartsOn: 1 as const }

/** Primer y último día (exclusivo) de la cuadrícula de un mes, de lunes a domingo */
export function monthRange(month: Date) {
  const from = startOfWeek(startOfMonth(month), WEEK)
  const to = addDays(endOfWeek(endOfMonth(month), WEEK), 1)
  return { from, to }
}

/** ¿El evento ocupa ese día? (los de varios días salen en todos) */
export function onDay(e: EventItem, day: Date) {
  const start = new Date(e.starts_at)
  const end = e.ends_at ? new Date(e.ends_at) : start
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  return start < addDays(dayStart, 1) && end >= dayStart
}

export function MonthView({
  month,
  onMonthChange,
  selected,
  onSelect,
  events,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  selected: Date
  onSelect: (day: Date) => void
  events: EventItem[]
}) {
  const { from, to } = monthRange(month)
  const days: Date[] = []
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d)
  const today = new Date()
  const title = format(month, 'MMMM yyyy', { locale: es })

  return (
    <div className="rounded-2xl border border-line bg-surface p-2">
      <div className="mb-1 flex items-center">
        <IconButton label="Mes anterior" onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <h2 className="flex-1 text-center font-display text-lg font-semibold first-letter:uppercase">{title}</h2>
        <IconButton label="Mes siguiente" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-bold text-muted" aria-hidden>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
          <span key={d} className="py-1">{d}</span>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((e) => onDay(e, day) && !e.cancelled)
          const isSelected = isSameDay(day, selected)
          const isToday = isSameDay(day, today)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={isSelected}
              aria-label={`${format(day, "EEEE d 'de' MMMM", { locale: es })}${dayEvents.length ? `, ${dayEvents.length} eventos` : ''}`}
              className={cn(
                'flex min-h-12 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 text-sm transition-colors',
                !isSameMonth(day, month) && 'text-muted/50',
                isSelected ? 'bg-brand-blue font-bold text-brand-black' : 'hover:bg-surface-2',
              )}
            >
              <span className={cn('grid size-6 place-items-center rounded-full', isToday && !isSelected && 'ring-2 ring-brand-blue')}>
                {day.getDate()}
              </span>
              <span className="flex gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={cn('size-1.5 rounded-full', isSelected && 'ring-1 ring-brand-black')}
                    style={{ backgroundColor: CATEGORIES[e.category].color }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
