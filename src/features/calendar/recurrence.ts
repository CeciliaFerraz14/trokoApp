import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfDay } from 'date-fns'

export type Repeat = 'none' | 'weekly' | 'biweekly' | 'monthly'

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: 'No se repite',
  weekly: 'Cada semana',
  biweekly: 'Cada dos semanas',
  monthly: 'Cada mes',
}

/** Máximo de fechas por serie (una clase semanal durante un curso ≈ 40) */
export const MAX_OCCURRENCES = 60

/**
 * Fechas de inicio de una serie, en hora local (así el cambio de horario de
 * verano/invierno no mueve la hora de las clases). Incluye la primera.
 */
export function occurrences(first: Date, repeat: Repeat, until: Date): Date[] {
  if (repeat === 'none') return [first]
  const step = (d: Date, i: number) =>
    repeat === 'weekly' ? addWeeks(d, i) : repeat === 'biweekly' ? addWeeks(d, 2 * i) : addMonths(d, i)
  const limit = endOfDay(until)
  const out: Date[] = []
  for (let i = 0; out.length < MAX_OCCURRENCES; i++) {
    // Siempre desde la primera: addMonths(31 ene, 1) = 28 feb, y no arrastra el 28 a marzo
    const d = step(first, i)
    if (d > limit) break
    out.push(d)
  }
  return out
}

/**
 * Nuevo inicio de otra fecha de la serie al editar "este y los siguientes":
 * se desplaza los mismos días que la fecha editada y toma su nueva hora.
 */
export function shiftOccurrence(occurrence: Date, oldStart: Date, newStart: Date): Date {
  const d = addDays(occurrence, differenceInCalendarDays(newStart, oldStart))
  d.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0)
  return d
}
