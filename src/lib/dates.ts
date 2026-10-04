import { differenceInCalendarDays, format, isSameYear } from 'date-fns'
import { es } from 'date-fns/locale'

/** Fecha corta para listas: "hoy, 18:30", "ayer, 9:05", "lunes, 20:00", "3 oct", "3 oct 2025" */
export function formatWhen(value: string | Date) {
  const date = new Date(value)
  const days = differenceInCalendarDays(new Date(), date)
  const time = format(date, 'H:mm')
  if (days === 0) return `hoy, ${time}`
  if (days === 1) return `ayer, ${time}`
  if (days > 1 && days < 7) return `${format(date, 'EEEE', { locale: es })}, ${time}`
  return format(date, isSameYear(date, new Date()) ? 'd MMM' : 'd MMM yyyy', { locale: es })
}

/** Fecha completa: "lunes 3 de octubre de 2026, 18:30" */
export function formatFull(value: string | Date) {
  return format(new Date(value), "EEEE d 'de' MMMM 'de' yyyy, H:mm", { locale: es })
}

/** Cabecera de día en la agenda: "Hoy", "Mañana", "Sábado 3 de octubre" */
export function formatDayHeading(value: string | Date) {
  const date = new Date(value)
  const days = differenceInCalendarDays(date, new Date())
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  const s = format(date, isSameYear(date, new Date()) ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  return s[0].toUpperCase() + s.slice(1)
}

/** Horario de un evento: "19:00 – 21:00", "19:00", "Todo el día", "3–5 oct" */
export function formatEventTime(e: { starts_at: string; ends_at: string | null; all_day: boolean }) {
  const start = new Date(e.starts_at)
  const end = e.ends_at ? new Date(e.ends_at) : null
  const multiDay = end && differenceInCalendarDays(end, start) > 0
  if (e.all_day) {
    return multiDay ? `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM', { locale: es })}` : 'Todo el día'
  }
  if (!end) return format(start, 'H:mm')
  if (multiDay) return `${format(start, 'd MMM, H:mm', { locale: es })} – ${format(end, 'd MMM, H:mm', { locale: es })}`
  return `${format(start, 'H:mm')} – ${format(end, 'H:mm')}`
}

/** Valores para <input type="date"> y <input type="time"> en hora local */
export const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd')
export const toTimeInput = (d: Date) => format(d, 'HH:mm')

/** Une fecha y hora de los inputs en una fecha local */
export function fromInputs(date: string, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

/** Separador de día en el chat: "Hoy", "Ayer", "Lunes 3 de octubre" */
export function formatPastDay(value: string | Date) {
  const date = new Date(value)
  const days = differenceInCalendarDays(new Date(), date)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  const s = format(date, isSameYear(date, new Date()) ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  return s[0].toUpperCase() + s.slice(1)
}
