import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { useMe } from '@/features/auth/useMe'
import { PendingPage } from '@/features/auth/PendingPage'
import { ErrorState } from '@/components/ui/States'
import { Splash } from './Splash'

/** Solo sin sesión (login, registro) */
export function PublicOnly() {
  const { session } = useAuth()
  return session ? <Navigate to="/" replace /> : <Outlet />
}

/**
 * Requiere sesión y cuenta aprobada. Si la cuenta está pendiente o
 * rechazada muestra la pantalla de espera en lugar de la app.
 */
export function RequireActive() {
  const { session } = useAuth()
  const location = useLocation()
  const me = useMe()

  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (me.isPending) return <Splash />
  if (me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }
  if (me.data.profile.status !== 'active') return <PendingPage profile={me.data.profile} />
  return <Outlet />
}

/** Solo admins (la seguridad real está en RLS; esto solo oculta pantallas) */
export function RequireAdmin() {
  const { data } = useMe()
  return data?.isAdmin ? <Outlet /> : <Navigate to="/" replace />
}
