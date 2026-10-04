import { NavLink } from 'react-router'
import { CalendarDays, Library, Megaphone, ShieldCheck, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

/** Barra de navegación inferior tipo app */
export function TabBar({
  isAdmin,
  pendingCount = 0,
  unreadCount = 0,
  wallNews = 0,
}: {
  isAdmin: boolean
  pendingCount?: number
  unreadCount?: number
  /** Grupos con publicaciones nuevas más mensajes del chat sin leer */
  wallNews?: number
}) {
  const tabs: Tab[] = [
    { to: '/avisos', label: 'Avisos', icon: Megaphone, badge: unreadCount },
    { to: '/calendario', label: 'Calendario', icon: CalendarDays },
    { to: '/muro', label: 'Muro', icon: UsersRound, badge: wallNews },
    { to: '/trokoteca', label: 'Trokoteca', icon: Library },
    { to: '/perfil', label: 'Perfil', icon: UserRound },
  ]
  if (isAdmin) tabs.push({ to: '/admin', label: 'Admin', icon: ShieldCheck, badge: pendingCount })
  // Con seis secciones (admins) el nombre de la activa no cabe en un móvil: solo iconos
  const showLabel = tabs.length <= 5

  return (
    // Píldora azul flotante; la sección activa es una cápsula negra con su nombre
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <ul className="pointer-events-auto mx-auto flex h-16 max-w-lg items-center justify-around rounded-full bg-brand-blue px-2 shadow-xl shadow-black/40">
        {tabs.map(({ to, label, icon: Icon, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn(
                  'relative flex h-12 items-center justify-center gap-2 rounded-full font-display text-sm font-semibold transition-colors',
                  isActive ? cn('bg-brand-black text-brand-blue', showLabel ? 'px-4' : 'w-12') : 'w-12 text-brand-black hover:bg-black/10',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  {isActive && showLabel && <span aria-hidden>{label}</span>}
                  {!!badge && (
                    <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-brand-black px-1 text-center text-[0.7rem] leading-5 font-bold text-white ring-2 ring-brand-blue">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
