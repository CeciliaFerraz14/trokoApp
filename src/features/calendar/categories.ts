import { Beer, CalendarDays, Drum, GraduationCap, MessagesSquare, Music, PartyPopper, type LucideIcon } from 'lucide-react'
import type { EventCategory } from '@/types/database'

export const CATEGORIES: Record<EventCategory, { label: string; icon: LucideIcon; color: string }> = {
  class: { label: 'Clase', icon: GraduationCap, color: '#6CB8E6' },
  rehearsal: { label: 'Ensayo', icon: Drum, color: '#9FA8DA' },
  gig: { label: 'Bolo', icon: Music, color: '#FF8A3D' },
  festival: { label: 'Festival', icon: PartyPopper, color: '#F48FB1' },
  meeting: { label: 'Reunión', icon: MessagesSquare, color: '#FFD54F' },
  social: { label: 'Quedada', icon: Beer, color: '#8BC34A' },
  other: { label: 'Otro', icon: CalendarDays, color: '#BDBDBD' },
}

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as EventCategory[]
