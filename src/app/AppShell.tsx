import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Spinner } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { usePendingUsers } from '@/features/admin/api'
import { useUnreadCount } from '@/features/announcements/api'
import { useWallNews } from '@/features/wall/news'
import { TabBar } from './TabBar'
import { OfflineBanner } from './OfflineBanner'
import { ErrorBoundary } from './ErrorBoundary'

export function AppShell() {
  const { data: me } = useMe()
  const isAdmin = !!me?.isAdmin
  const { pathname } = useLocation()
  const pending = usePendingUsers({ enabled: isAdmin })
  const unread = useUnreadCount()
  const wallNews = useWallNews()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Espacio inferior = altura de la barra + safe area */}
      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <OfflineBanner />
      <TabBar isAdmin={isAdmin} pendingCount={pending.data?.length ?? 0} unreadCount={unread} wallNews={wallNews.size} />
    </div>
  )
}
