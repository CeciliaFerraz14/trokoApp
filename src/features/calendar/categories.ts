import { Beer, CalendarDays, Drum, Music, PartyPopper, Sparkles, Ticket, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { EventCategory } from '@/types/database'

export const CATEGORIES: Record<EventCategory, { label: string; icon: LucideIcon; color: string }> = {
  class: { label: 'Clase', icon: Drum, color: '#6CB8E6' },
  no_class: { label: 'No hay clase', icon: TriangleAlert, color: '#EF5350' },
  event: { label: 'Evento', icon: Ticket, color: '#FFD54F' },
  workshop: { label: 'Talleres especiales', icon: Sparkles, color: '#F06292' },
  gig: { label: 'Bolo', icon: Music, color: '#FF8A3D' },
  festival: { label: 'Festival', icon: PartyPopper, color: '#FFD54F' },
  social: { label: 'Quedada', icon: Beer, color: '#8BC34A' },
  other: { label: 'Otro', icon: CalendarDays, color: '#BDBDBD' },
}

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as EventCategory[]

/** Tipo de un evento; uno desconocido (p. ej. de una versión más nueva) se ve como "Otro" */
export const categoryOf = (c: EventCategory) => CATEGORIES[c] ?? CATEGORIES.other
