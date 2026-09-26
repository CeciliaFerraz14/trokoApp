import { NavLink } from 'react-router'
import { CalendarDays, Megaphone, ShieldCheck, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
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
  /** Grupos con publicaciones nuevas */
  wallNews?: number
}) {
  const tabs: Tab[] = [
    { to: '/avisos', label: 'Avisos', icon: Megaphone, badge: unreadCount },
    { to: '/calendario', label: 'Calendario', icon: CalendarDays },
    { to: '/muro', label: 'Muro', icon: UsersRound, badge: wallNews },
    { to: '/perfil', label: 'Perfil', icon: UserRound },
  ]
  if (isAdmin) tabs.push({ to: '/admin', label: 'Admin', icon: ShieldCheck, badge: pendingCount })

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-chrome/95 pb-safe backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ to, label, icon: Icon, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 font-display text-[0.7rem] font-semibold tracking-wide transition-colors',
                  isActive ? 'text-brand-blue' : 'text-white/55 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('relative grid h-8 w-14 place-items-center rounded-full', isActive && 'bg-brand-blue/15')}>
                    <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                    {!!badge && (
                      <span className="absolute -top-1 right-1 min-w-5 rounded-full bg-brand-blue px-1 text-center text-[0.7rem] leading-5 font-bold text-brand-black">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
